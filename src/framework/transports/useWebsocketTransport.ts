// TODO: AdUpdate sendFrame to fully handle data sending from scheduler

import { useState, useRef, useCallback } from "react";
import { OffloadTransport } from "./types";

export function useWebSocketTransport(): OffloadTransport {
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected" | "failed"
  >("disconnected");
  const transportMethod = "websocket";
  const socketRef = useRef<WebSocket | null>(null);
  const onDataCallbackRef = useRef<(data: any) => void>();

  const onDataReceived = useCallback((callback: (data: any) => void) => {
    onDataCallbackRef.current = callback;
  }, []);

  const connect = useCallback(async (config: { serverUrl: string }) => {
    setConnectionState("connecting");

    const ws = new WebSocket(config.serverUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnectionState("connected");
    };

    ws.onmessage = (event) => {
      onDataCallbackRef.current?.(JSON.parse(event.data));
    };

    ws.onerror = () => {
      setConnectionState("failed");
    };

    ws.onclose = () => {
      setConnectionState("disconnected");
    };
  }, []);

  const sendFrame = useCallback((frame: Blob) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(frame);
    }
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
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
