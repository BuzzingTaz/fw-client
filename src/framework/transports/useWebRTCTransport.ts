import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { TransportMethods, WebRTCTransport } from "./types";

type SignalMessage = {
  webrtc_signal?: {
    type: string;
    sdp?: string;
    candidate?: RTCIceCandidateInit;
  };
};

/** Mirror offload canvas to the page corner. Off by default in production; on in `development`, or set `NEXT_PUBLIC_WEBRTC_DEBUG_MIRROR=true`. */
const DEBUG_MIRROR_OFFLOAD_CANVAS =
  (typeof process !== "undefined" && process.env.NODE_ENV === "development") ||
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_WEBRTC_DEBUG_MIRROR === "true");

/**
 * Copies the current bitmap of `source` to a visible canvas in the corner of the page.
 * Use to confirm `drawImage` into the offload canvas is producing real pixels.
 */
function mirrorOffloadCanvasForDebug(source: HTMLCanvasElement) {
  if (!DEBUG_MIRROR_OFFLOAD_CANVAS || typeof document === "undefined") return;

  const wrapId = "__webrtc_offload_output_debug__";
  let wrap = document.getElementById(wrapId);
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = wrapId;
    wrap.style.cssText =
      "position:fixed;bottom:12px;right:12px;z-index:2147483647;pointer-events:none;border:3px solid #ef4444;background:#111;padding:6px;box-shadow:0 4px 12px rgba(0,0,0,0.4);";
    const label = document.createElement("div");
    label.textContent = "Offload canvas (debug mirror)";
    label.style.cssText = "color:#fff;font:11px monospace;margin:0 0 6px 0;";
    wrap.appendChild(label);
    const c = document.createElement("canvas");
    c.style.cssText = "display:block;max-width:min(42vw,520px);height:auto;image-rendering:pixelated;";
    wrap.appendChild(c);
    document.body.appendChild(wrap);
  }

  const dest = wrap.querySelector("canvas");
  if (!dest) return;
  if (dest.width !== source.width || dest.height !== source.height) {
    dest.width = source.width;
    dest.height = source.height;
  }
  const dctx = dest.getContext("2d");
  if (!dctx) return;
  dctx.drawImage(source, 0, 0);
}

/**
 * Pushes the current canvas bitmap into the MediaStream produced by `captureStream`.
 * Required when using manual capture (`captureStream(0)`), and important when the canvas
 * is updated on an irregular schedule (e.g. offload every Nth frame) so the WebRTC encoder
 * sees a frame at the same time as your draw.
 */
function requestCanvasCaptureFrame(stream: MediaStream | null) {
  if (!stream) return;
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  const cap = track as CanvasCaptureMediaStreamTrack;
  if (typeof cap.requestFrame === "function") {
    cap.requestFrame();
  }
}

/**
 * requestFrame() samples the canvas on the next animation frame; drawing from video/canvas
 * can lag one GPU frame. Wait until after paint, then request a capture (double rAF is a
 * common fix for "encoder sees stale/empty surface" / green decoded frames).
 */
function scheduleCanvasCaptureAfterPaint(stream: MediaStream | null) {
  if (!stream) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      requestCanvasCaptureFrame(stream);
    });
  });
}

/** Setting canvas width/height resets the context — must re-acquire before drawing. */
function replaceOutputCanvasContext(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { alpha: false });
  return ctx;
}

/** Helps the encoder treat canvas content as detail-rich (vs motion-only). */
function applyCanvasVideoTrackHints(track: MediaStreamTrack) {
  if (track.kind !== "video") return;
  try {
    track.contentHint = "detail";
  } catch {
    /* ignore */
  }
}

/** In development, log encoder output so raw RTP size can be compared to framesEncoded / bytesSent. */
async function logOutboundVideoStatsOnce(pc: RTCPeerConnection) {
  const enabled =
    typeof process !== "undefined" && process.env.NODE_ENV === "development";
  if (!enabled) return;

  while (true) {
  await new Promise((r) => setTimeout(r, 2500));
  const sender = pc.getSenders().find((s) => s.track?.kind === "video");
  if (!sender) {
    console.debug("[WebRTC] stats: no video sender");
    return;
  }
  const stats = await sender.getStats();
  stats.forEach((report) => {
    if (report.type !== "outbound-rtp") return;
    const r = report as RTCOutboundRtpStreamStats & {
      keyFramesEncoded?: number;
      qpSum?: number;
      mediaType?: string;
    };
    if (r.kind && r.kind !== "video") return;
    if (r.mediaType && r.mediaType !== "video") return;
    console.log("[WebRTC] outbound-rtp (video)", {
      bytesSent: r.bytesSent,
      packetsSent: r.packetsSent,
      framesEncoded: r.framesEncoded,
      keyFramesEncoded: r.keyFramesEncoded,
      qpSum: r.qpSum,
    });
  });
  }
}

export function useWebRTCTransport(): WebRTCTransport {
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected" | "failed"
  >("disconnected");
  const connectionStateRef = useRef<
    "disconnected" | "connecting" | "connected" | "failed"
  >("disconnected");
  const transportMethod = useRef<TransportMethods>("webrtc");
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const onDataCallbackRef = useRef<(data: unknown) => void>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingSocketRef = useRef<WebSocket | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outputCanvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  /** Server offer arrives before we have real frame dimensions — apply after first sendFrame. */
  const pendingRemoteOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  /** ICE must be applied after setRemoteDescription — queue if needed. */
  const pendingRemoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  /** True after canvas has real dimensions, captureStream(), and addTrack(). */
  const captureStartedRef = useRef(false);
  const outputStreamRef = useRef<MediaStream | null>(null);
  /** Ensures we only run the async bootstrap once. */
  const negotiationInFlightRef = useRef(false);

  const trackGeneratorRef = useRef<any>(null); // MediaStreamTrackGenerator
  const trackWriterRef = useRef<any>(null); // WritableStreamDefaultWriter<VideoFrame>
  const captureStartTimeRef = useRef<number | null>(null);

  const flushPendingRemoteCandidates = useCallback(async (pc: RTCPeerConnection) => {
    const queued = pendingRemoteCandidatesRef.current;
    pendingRemoteCandidatesRef.current = [];
    for (const c of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.error("addIceCandidate failed", e);
      }
    }
  }, []);

  /**
   * First frame: size canvas from real video, draw once, captureStream + addTrack,
   * then complete offer/answer (no renegotiation — one round).
   */
  const ensureCaptureAndAnswer = useCallback(
    async (frameCanvas: HTMLCanvasElement) => {
      const pc = peerConnectionRef.current;
      const ws = signalingSocketRef.current;
      if (!pc || !ws) return;

      if (negotiationInFlightRef.current) return;
      negotiationInFlightRef.current = true;

      try {
        const offer = pendingRemoteOfferRef.current;
        if (!offer) {
          console.warn("WebRTC: no pending offer.");
          return;
        }

        pendingRemoteOfferRef.current = null;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // --- THE ALTERNATIVE: WebCodecs Track Generator ---
        if (typeof (window as any).MediaStreamTrackGenerator !== "undefined") {
          const generator = new (window as any).MediaStreamTrackGenerator({ kind: "video" });
          trackGeneratorRef.current = generator;
          trackWriterRef.current = generator.writable.getWriter();

          applyCanvasVideoTrackHints(generator);

          pc.addTrack(generator);
          captureStartTimeRef.current = performance.now();
          captureStartedRef.current = true;
        } else {
          throw new Error("Browser does not support MediaStreamTrackGenerator.");
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        ws.send(
          JSON.stringify({
            webrtc_signal: { type: "answer", sdp: answer.sdp },
          }),
        );

        await flushPendingRemoteCandidates(pc);
      } catch (err) {
         console.error("Failed to setup WebCodecs WebRTC pipeline", err);
      } finally {
        negotiationInFlightRef.current = false;
      }
    },
    [flushPendingRemoteCandidates],
  );

  // Data receiver handler
  const onDataReceived = useCallback((callback: (data: unknown) => void) => {
    onDataCallbackRef.current = callback;
  }, []);

  const connect = useCallback(async (config: { serverUrl: string }) => {
    setConnectionState("connecting");
    connectionStateRef.current = "connecting";

    pendingRemoteOfferRef.current = null;
    pendingRemoteCandidatesRef.current = [];
    captureStartedRef.current = false;
    outputStreamRef.current = null;
    negotiationInFlightRef.current = false;

    if (!outputCanvasRef.current) {
      outputCanvasRef.current = document.createElement("canvas");
      outputCanvasCtxRef.current = replaceOutputCanvasContext(outputCanvasRef.current);
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peerConnectionRef.current = pc;


    pc.ondatachannel = (event) => {
      const dc = event.channel;
      dc.onmessage = (event) => {
        onDataCallbackRef.current?.(JSON.parse(event.data));
      };
      dc.onopen = () => console.log("Data channel open");
      dataChannelRef.current = dc;
    };

    const ws = new WebSocket(config.serverUrl);
    signalingSocketRef.current = ws;

    ws.onopen = async () => {
      console.log("Signaling WebSocket connected");
    };

    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data) as SignalMessage;
      if (!message.webrtc_signal) return;

      const messageSignal = message.webrtc_signal;

      if (messageSignal.type === "candidate" && messageSignal.candidate) {
        if (!pc.remoteDescription) {
          pendingRemoteCandidatesRef.current.push(messageSignal.candidate);
          return;
        }
        try {
          await pc.addIceCandidate(new RTCIceCandidate(messageSignal.candidate));
        } catch (e) {
          console.error("addIceCandidate failed", e);
        }
        return;
      }

      if (messageSignal.type === "offer" && messageSignal.sdp) {
        pendingRemoteOfferRef.current = {
          type: "offer",
          sdp: messageSignal.sdp,
        };
        // First real video frame will call ensureCaptureAndAnswer (addTrack + answer).
        return;
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        ws.send(
          JSON.stringify({
            webrtc_signal: { type: "candidate", candidate: event.candidate },
          }),
        );
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setConnectionState("connected");
        connectionStateRef.current = "connected";
        void logOutboundVideoStatsOnce(pc);
      } else if (pc.connectionState === "failed") {
        setConnectionState("failed");
        connectionStateRef.current = "failed";
      }
    };
  }, []);

  const sendFrame = useCallback(
    (frameCanvas: HTMLCanvasElement) => {
      if (
        connectionStateRef.current !== "connecting" &&
        connectionStateRef.current !== "connected"
      ) {
        return;
      }

      if (frameCanvas.width === 0 || frameCanvas.height === 0) {
        return;
      }

      if (!captureStartedRef.current) {
        void ensureCaptureAndAnswer(frameCanvas);
        return;
      }

      const writer = trackWriterRef.current;
      if (writer) {
        try {
          const elapsedMs = performance.now() - captureStartTimeRef.current!;

          const timestampUs = Math.floor(elapsedMs * 1000);
          const frame = new VideoFrame(frameCanvas, {
            timestamp: timestampUs,
            alpha: "discard", // VP8 hates alpha
          });

          writer.write(frame).then(() => {
            frame.close();
          }).catch((err: any) => {
            console.error("Stream writing failed", err);
            frame.close();
          });
        } catch (e) {
           console.error("Failed to create VideoFrame", e);
        }
      }
    },
    [ensureCaptureAndAnswer],
  );

  const disconnect = useCallback(() => {
    outputStreamRef.current?.getTracks().forEach((t) => t.stop());
    outputStreamRef.current = null;
    pendingRemoteOfferRef.current = null;
    pendingRemoteCandidatesRef.current = [];
    captureStartedRef.current = false;
    negotiationInFlightRef.current = false;

    peerConnectionRef.current?.close();
    signalingSocketRef.current?.close();
    setConnectionState("disconnected");
    connectionStateRef.current = "disconnected";
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const offloadTransport = useMemo(
    () => ({
      connect,
      disconnect,
      sendFrame,
      onDataReceived,
      connectionState,
      transportMethod: transportMethod.current,
    }),
    [connect, disconnect, sendFrame, onDataReceived, connectionState],
  );
  return useMemo(
    () => ({
      pc: peerConnectionRef.current,
      offloadTransport,
    }),
    [offloadTransport],
  );
}
