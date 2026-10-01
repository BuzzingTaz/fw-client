// TODO: AdUpdate sendFrame to fully handle data sending from scheduler

import { useState, useRef, useCallback } from "react";
import { TransportMethods, WebSocketTransport } from "./types";

export function useWebSocketTransport(): WebSocketTransport {
  const [transportConnectionState, setTransportConnectionState] = useState<
    "disconnected" | "connecting" | "connected" | "failed"
  >("disconnected");
  const transportMethod = useRef<TransportMethods>("websocket");
  const socketRef = useRef<WebSocket | null>(null);
  const onDataCallbackRef = useRef<(data: any) => void>(null);

  const onDataReceived = useCallback((callback: (data: any) => void) => {
    onDataCallbackRef.current = callback;
  }, []);

  const connect = useCallback(async (config: { serverUrl: string }) => {
    setTransportConnectionState("connecting");

    const ws = new WebSocket(config.serverUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setTransportConnectionState("connected");
    };

    ws.onmessage = (event) => {
      onDataCallbackRef.current?.(JSON.parse(event.data));
    };

    ws.onerror = () => {
      setTransportConnectionState("failed");
    };

    ws.onclose = () => {
      setTransportConnectionState("disconnected");
    };
  }, []);

  const setSourceStream = useCallback((stream: MediaStream) => {
    // NOTE: WebSocket transport is currently incomplete.
    // To implement this, we'd likely need to use an ImageCapture or MediaRecorder
    // on the stream to extract frames and send them via WebSocket.
    console.warn("setSourceStream not fully implemented for WebSocketTransport");
  }, []);

  const trackCaptureTime = useCallback((time: number) => {
    // track capture time
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
  }, []);

  return {
    socket: socketRef.current,
    offloadTransport: {
      connect,
      disconnect,
      setSourceStream,
      trackCaptureTime,
      onDataReceived,
      connectionState: transportConnectionState,
      transportMethod: transportMethod.current,
    },
  };
}
