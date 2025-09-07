import { useState, useRef, useCallback, useEffect } from "react";
import { OffloadTransport } from "./types";

export function useWebRTCTransport(): OffloadTransport {
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected" | "failed"
  >("disconnected");
  const transportMethod = useRef("webrtc"); // TODO: Fix type issue

  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const onDataCallbackRef = useRef<(data: any) => void>();
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingSocketRef = useRef<WebSocket | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const onDataReceived = useCallback(
    (callback: (data: any) => void) => {
      onDataCallbackRef.current = callback;
    },
    [onDataCallbackRef],
  );

  const connect = useCallback(
    async (config: { signalingServerUrl: string }) => {
      setConnectionState("connecting");

      if (!outputCanvasRef.current) {
        outputCanvasRef.current = document.createElement("canvas");
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

      // Create Data Channel for receiving results from the edge
      const dc = pc.createDataChannel("results-channel");
      dc.onmessage = (event) => {
        onDataCallbackRef.current?.(JSON.parse(event.data));
      };
      dc.onopen = () => console.log("Data channel open");
      dataChannelRef.current = dc;

      // Setup Signaling via WebSockets
      const ws = new WebSocket(config.signalingServerUrl);
      signalingSocketRef.current = ws;

      ws.onopen = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", sdp: offer.sdp }));
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(message));
        } else if (message.type === "candidate") {
          await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          ws.send(
            JSON.stringify({ type: "candidate", candidate: event.candidate }),
          );
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setConnectionState("connected");
          ws.close(); // Signaling is no longer needed
        } else if (pc.connectionState === "failed") {
          setConnectionState("failed");
        }
      };
    },
    [],
  );

  const sendFrame = useCallback((frameCanvas: HTMLCanvasElement) => {
    // This transport's responsibility is to draw the incoming frame
    // onto its own canvas, which is being streamed via WebRTC.
    if (connectionState === "connected" && outputCanvasRef.current) {
      const outputCanvas = outputCanvasRef.current;
      const ctx = outputCanvas.getContext("2d");
      if (ctx) {
        if (outputCanvas.width !== frameCanvas.width) {
          outputCanvas.width = frameCanvas.width;
          outputCanvas.height = frameCanvas.height;
        }
        ctx.drawImage(frameCanvas, 0, 0);
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    peerConnectionRef.current?.close();
    setConnectionState("disconnected");
  }, []);

  return {
    connect,
    disconnect,
    sendFrame,
    onDataReceived,
    connectionState,
    transportMethod,
  };
}
