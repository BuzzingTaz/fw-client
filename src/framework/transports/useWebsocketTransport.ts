// TODO: AdUpdate sendFrame to fully handle data sending from scheduler

import { useState, useRef, useCallback, useEffect } from "react";
import { TransportMethods, WebSocketTransport } from "./types";

export function useWebSocketTransport(): WebSocketTransport {
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected" | "failed"
  >("disconnected");
  const transportMethod = useRef<TransportMethods>("websocket");
  const socketRef = useRef<WebSocket | null>(null);
  const onDataCallbackRef = useRef<(data: any) => void>(null);
  
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isManuallyClosedRef = useRef(false);
  const MAX_RECONNECT_ATTEMPTS = 10;
  const BASE_RECONNECT_DELAY = 500;
  const MAX_RECONNECT_DELAY = 30000;

  const onDataReceived = useCallback((callback: (data: any) => void) => {
    onDataCallbackRef.current = callback;
  }, []);

  const getBackoffDelay = useCallback((attempt: number) => {
    const exponential = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
    const jitter = Math.random() * 0.5 * exponential;
    return Math.floor(exponential + jitter);
  }, []);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (socketRef.current) {
      const ws = socketRef.current;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      socketRef.current = null;
    }
  }, []);

  const connect = useCallback(async (config: { serverUrl: string }) => {
    if (socketRef.current?.readyState === WebSocket.CONNECTING || 
        socketRef.current?.readyState === WebSocket.OPEN) {
      console.log("WebSocket already connected or connecting, skipping");
      return;
    }

    cleanup();
    isManuallyClosedRef.current = false;
    setConnectionState("connecting");

    console.log("WebSocket connecting to:", config.serverUrl);

    try {
      const ws = new WebSocket(config.serverUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected to scheduler");
        reconnectAttemptsRef.current = 0;
        setConnectionState("connected");
      };

      ws.onmessage = (event) => {
        try {
          if (event.data instanceof Blob) {
            console.log("Received binary data:", event.data.size, "bytes");
            return;
          }
          const data = JSON.parse(event.data);
          onDataCallbackRef.current?.(data);
        } catch (e) {
          console.error("Failed to parse WebSocket message:", e, "Data:", event.data);
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        console.error("WebSocket readyState:", ws.readyState);
        console.error("WebSocket URL:", ws.url);
        setConnectionState("failed");
      };

      ws.onclose = (event) => {
        console.log("WebSocket closed", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        setConnectionState("disconnected");
        socketRef.current = null;

        if (!isManuallyClosedRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = getBackoffDelay(reconnectAttemptsRef.current);
          reconnectAttemptsRef.current++;
          console.log(`WebSocket reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
          
          reconnectTimerRef.current = setTimeout(() => {
            connect(config);
          }, delay);
        } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          console.error("Max WebSocket reconnection attempts reached");
          setConnectionState("failed");
        }
      };
    } catch (err) {
      console.error("Failed to create WebSocket:", err);
      setConnectionState("failed");
    }
  }, [cleanup, getBackoffDelay]);

  const sendFrame = useCallback((frameCanvas: HTMLCanvasElement) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket not open, cannot send frame. State:", socketRef.current?.readyState);
      return;
    }

    frameCanvas.toBlob(
      (blob) => {
        if (blob && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(blob);
          console.log("Sent frame:", blob.size, "bytes");
        } else {
          console.warn("WebSocket closed before frame could be sent");
        }
      },
      "image/jpeg",
      0.85
    );
  }, []);

  const disconnect = useCallback(() => {
    isManuallyClosedRef.current = true;
    reconnectAttemptsRef.current = 0;
    cleanup();
    setConnectionState("disconnected");
  }, [cleanup]);

  useEffect(() => {
    return () => {
      isManuallyClosedRef.current = true;
      cleanup();
    };
  }, [cleanup]);

  return {
    socket: socketRef.current,
    offloadTransport: {
      connect,
      disconnect,
      sendFrame,
      onDataReceived,
      connectionState,
      transportMethod: transportMethod.current,
    },
  };
}