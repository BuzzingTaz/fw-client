import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { TransportMethods, WebRTCTransport } from "./types";
import { telemetryStore } from "../telemetry/TelemetryStore";

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
  const captureTimeQueueRef = useRef<number[]>([]);

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
      // @ts-ignore
      encodedInsertableStreams: true,
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

          // Force a high starting bitrate (5000 kbps) to prevent the WebRTC engine
          // from aggressively dropping frames or downscaling resolution during the slow ramp-up phase.
          if (answer.sdp) {
            answer.sdp = answer.sdp.replace(/a=mid:(.*)\r\n/g, 'a=mid:$1\r\nb=AS:5000\r\n');
          }

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

  const trackCaptureTime = useCallback((time: number) => {
    captureTimeQueueRef.current.push(time);
  }, []);

  const setSourceStream = useCallback((stream: MediaStream) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    outputStreamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    if (!track) return;

    try {
      track.contentHint = "detail";
    } catch (e) {
      // Ignore if not supported
    }

    let sender = pc.getSenders().find(s => !s.track || s.track.kind === "video");
    if (sender) {
      sender.replaceTrack(track).catch(e => console.error("replaceTrack failed", e));

      try {
        const params = sender.getParameters();
        if (params) {
          // @ts-ignore - degradationPreference is valid in WebRTC but sometimes missing in TS dom libs
          params.degradationPreference = "maintain-resolution";
          if (!params.encodings) {
            params.encodings = [{}];
          }
          if (params.encodings.length > 0) {
            params.encodings[0].maxBitrate = 5000000;
            params.encodings[0].maxFramerate = 60;
          }
          sender.setParameters(params).catch(e => console.error("setParameters failed", e));
        }
      } catch (e) {
        console.error("Failed to set degradationPreference", e);
      }
    } else {
      sender = pc.addTrack(track, stream);
    }

    if (sender) {
      // @ts-ignore
      if (typeof RTCRtpScriptTransform !== 'undefined') {
        const worker = new Worker(new URL('./transformWorker.ts', import.meta.url));
        worker.onmessage = (e) => {
          if (e.data.type === 'frame') {
            const offloadTime = performance.now();
            const rtpTimestamp = e.data.timestamp;
            const capTime = captureTimeQueueRef.current.shift();
            if (capTime !== undefined) {
              telemetryStore.logEvent(rtpTimestamp, "capture", capTime);
            }
            telemetryStore.logEvent(rtpTimestamp, "offload", offloadTime);
          }
        };
        // @ts-ignore
        sender.transform = new RTCRtpScriptTransform(worker, {});
      } else if ("createEncodedStreams" in sender) {
        // @ts-ignore
        const { readable, writable } = sender.createEncodedStreams();
        readable.pipeThrough(new TransformStream({
          transform(chunk, controller) {
            if (chunk instanceof RTCEncodedVideoFrame) {
              const rtpTimestamp = chunk.timestamp;
              const capTime = captureTimeQueueRef.current.shift();
              if (capTime !== undefined) {
                telemetryStore.logEvent(rtpTimestamp, "capture", capTime);
              }
              telemetryStore.logEvent(rtpTimestamp, "offload", performance.now());
            }
            controller.enqueue(chunk);
          }
        })).pipeTo(writable);
      }
    }
  }, []);

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
      setSourceStream,
      trackCaptureTime,
      onDataReceived,
      connectionState: transportConnectionState,
      transportMethod: transportMethod.current,
    }),
    [connect, disconnect, setSourceStream, trackCaptureTime, onDataReceived, transportConnectionState],
  );
  return useMemo(
    () => ({
      pc: peerConnectionRef.current,
      offloadTransport,
    }),
    [offloadTransport],
  );
}
