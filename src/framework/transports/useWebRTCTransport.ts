import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { TransportMethods, WebRTCTransport } from "./types";

export function useWebRTCTransport(): WebRTCTransport {
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected" | "failed"
  >("disconnected");
  const connectionStateRef = useRef<
    "disconnected" | "connecting" | "connected" | "failed"
  >("disconnected");
  const transportMethod = useRef<TransportMethods>("webrtc");
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const onDataCallbackRef = useRef<(data: any) => void>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingSocketRef = useRef<WebSocket | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outputCanvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Data receiver handler
  const onDataReceived = useCallback((callback: (data: any) => void) => {
    onDataCallbackRef.current = callback;
  }, []);

  const connect = useCallback(async (config: { serverUrl: string }) => {
    setConnectionState("connecting");
    connectionStateRef.current = "connecting";

    if (!outputCanvasRef.current) {
      outputCanvasRef.current = document.createElement("canvas");
      outputCanvasCtxRef.current = outputCanvasRef.current.getContext("2d");
    }

    // Setup Peer Connection
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }], // Public STUN server
    });
    peerConnectionRef.current = pc;

    // Add Media Tracks to send video to the edge
    const outputStream = outputCanvasRef.current.captureStream(30);
    outputStream
      .getTracks()
      .forEach((track) => pc.addTrack(track, outputStream));

    pc.ondatachannel = (event) => {
      const dc = event.channel;
      dc.onmessage = (event) => {
        onDataCallbackRef.current?.(JSON.parse(event.data));
      };
      dc.onopen = () => console.log("Data channel open");
      dataChannelRef.current = dc;
    };

    // Setup Signaling via WebSockets
    const ws = new WebSocket(config.serverUrl);
    signalingSocketRef.current = ws;

    ws.onopen = async () => {
      console.log("Signaling WebSocket connected");
    };

    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      if (!message.webrtc_signal) return;

      const messageSignal = message.webrtc_signal;
      if (messageSignal.type === "candidate") {
        await pc.addIceCandidate(new RTCIceCandidate(messageSignal.candidate));
      } else if (messageSignal.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(messageSignal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(
          JSON.stringify({
            webrtc_signal: { type: "answer", sdp: answer.sdp },
          }),
        );
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
      } else if (pc.connectionState === "failed") {
        setConnectionState("failed");
        connectionStateRef.current = "failed";
      }
    };
  }, []);

  const sendFrame = useCallback((frameCanvas: HTMLCanvasElement) => {
    if (
      connectionStateRef.current === "connected" &&
      outputCanvasRef.current &&
      outputCanvasCtxRef.current
    ) {
      const outputCanvas = outputCanvasRef.current;
      const ctx = outputCanvasCtxRef.current;
      if (
        outputCanvas.width !== frameCanvas.width ||
        outputCanvas.height !== frameCanvas.height
      ) {
        outputCanvas.width = frameCanvas.width;
        outputCanvas.height = frameCanvas.height;
      }
      ctx.drawImage(frameCanvas, 0, 0);
      console.log("frame drawn to offload canvas");
    } else {
      console.log("sendFrame SKIPPED - condition failed");
    }
  }, []);

  const disconnect = useCallback(() => {
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
