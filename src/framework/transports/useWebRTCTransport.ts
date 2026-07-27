import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { TransportMethods, WebRTCTransport } from "./types";

type SignalMessage = {
  webrtc_signal?: {
    type: string;
    sdp?: string;
    candidate?: RTCIceCandidateInit;
  };
};


export function useWebRTCTransport(): WebRTCTransport {

  const [transportConnectionState, setTransportConnectionState] = useState<
    "disconnected" | "connecting" | "connected" | "failed"
  >("disconnected");
  const transportMethod = useRef<TransportMethods>("webrtc");
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const onDataCallbackRef = useRef<(data: unknown) => void>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingSocketRef = useRef<WebSocket | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outputCanvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const captureStartedRef = useRef(false);
  const outputStreamRef = useRef<MediaStream | null>(null);

  const onDataReceived = useCallback((callback: (data: unknown) => void) => {
    onDataCallbackRef.current = callback;
  }, []);

  const connect = useCallback(async (config: { serverUrl: string }) => {
    setTransportConnectionState("connecting");

    captureStartedRef.current = false;
    outputStreamRef.current = null;

    if (!outputCanvasRef.current) {
      outputCanvasRef.current = document.createElement("canvas");
      outputCanvasCtxRef.current = outputCanvasRef.current.getContext("2d");
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
        try {
          await pc.addIceCandidate(new RTCIceCandidate(messageSignal.candidate));
        } catch (e) {
          console.error("addIceCandidate failed", e);
        }
        return;
      }

      if (messageSignal.type === "offer" && messageSignal.sdp) {
        try {
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: "offer", sdp: messageSignal.sdp })
          );

          // Force the video transceiver to sendrecv so our answer negotiates sending capability.
          // This avoids renegotiation when we later attach the video track.
          let videoTransceiver = pc.getTransceivers().find(
            (t) => t.receiver.track.kind === "video" || t.sender.track?.kind === "video"
          );

          if (videoTransceiver) {
            videoTransceiver.direction = "sendrecv";
          } else {
            pc.addTransceiver("video", { direction: "sendrecv" });
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          ws.send(
            JSON.stringify({
              webrtc_signal: { type: "answer", sdp: answer.sdp },
            }),
          );
        } catch (e) {
          console.error("setRemoteDescription/answer failed", e);
        }
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
        setTransportConnectionState("connected");
      } else if (pc.connectionState === "failed") {
        setTransportConnectionState("failed");
      }
    };
  }, []);

  const sendFrame = useCallback(
    (frameCanvas: HTMLCanvasElement, frameId?: number) => {
      if (
        transportConnectionState !== "connecting" &&
        transportConnectionState !== "connected"
      ) {
        return;
      }
      if (!outputCanvasRef.current || !outputCanvasCtxRef.current) return;

      if (frameCanvas.width === 0 || frameCanvas.height === 0) return;

      const pc = peerConnectionRef.current;
      if (!captureStartedRef.current && pc) {
        const canvas = outputCanvasRef.current;
        const ctx = outputCanvasCtxRef.current;
        canvas.width = frameCanvas.width;
        canvas.height = frameCanvas.height;
        ctx.drawImage(frameCanvas, 0, 0);

        const stream = canvas.captureStream(0);
        outputStreamRef.current = stream;
        const track = stream.getVideoTracks()[0];

        if (track) {
          applyCanvasVideoTrackHints(track);

          // Use replaceTrack on the existing sender to avoid renegotiation
          // and avoid initializing the encoder until the canvas has the correct dimensions!
          const sender = pc.getSenders().find(s => !s.track || s.track.kind === "video");
          if (sender) {
            sender.replaceTrack(track).catch(e => console.error("replaceTrack failed", e));
          } else {
            pc.addTrack(track, stream);
          }
        }

        captureStartedRef.current = true;
        requestCanvasCaptureFrame(stream);
        return;
      }

      const ctx = outputCanvasCtxRef.current;
      ctx.drawImage(frameCanvas, 0, 0);
      requestCanvasCaptureFrame(outputStreamRef.current);

      if (frameId !== undefined && dataChannelRef.current?.readyState === "open") {
        dataChannelRef.current.send(JSON.stringify({
          type: "frame_info",
          frameId,
          timestamp: performance.now()
        }));
      }
    },
    [transportConnectionState],
  );

  const disconnect = useCallback(() => {
    outputStreamRef.current?.getTracks().forEach((t) => t.stop());
    outputStreamRef.current = null;
    captureStartedRef.current = false;

    peerConnectionRef.current?.close();
    signalingSocketRef.current?.close();
    dataChannelRef.current = null;
    setTransportConnectionState("disconnected");
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
      connectionState: transportConnectionState,
      transportMethod: transportMethod.current,
    }),
    [connect, disconnect, sendFrame, onDataReceived, transportConnectionState],
  );
  return useMemo(
    () => ({
      pc: peerConnectionRef.current,
      offloadTransport,
    }),
    [offloadTransport],
  );
}

/**
 * Pushes the current canvas bitmap into the MediaStream produced by `captureStream`.
 * Required when using manual capture (`captureStream(0)`)
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

/** Helps the encoder treat canvas content as detail-rich (vs motion-only). */
function applyCanvasVideoTrackHints(track: MediaStreamTrack) {
  if (track.kind !== "video") return;
  try {
    track.contentHint = "detail";
  } catch {
    /* ignore */
  }
}
