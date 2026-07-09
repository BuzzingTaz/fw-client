"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  MultiStreamConfig,
  StreamConnectionState,
  StreamDetectionBox,
  StreamStats,
  defaultStreamStats,
} from "../definitions";

interface UseSimulatedStreamArgs {
  streamId: string;
  videoUrl: string;
  config: MultiStreamConfig;
  active: boolean;
  onStats?: (streamId: string, stats: StreamStats) => void;
}

interface UseSimulatedStreamResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoDims: { width: number; height: number };
  boxes: StreamDetectionBox[];
  stats: StreamStats;
}

const MAX_RECONNECT_ATTEMPTS = 6;
const BASE_RECONNECT_DELAY_MS = 800;
const MAX_RECONNECT_DELAY_MS = 15000;

export function useSimulatedStream({
  streamId,
  videoUrl,
  config,
  active,
  onStats,
}: UseSimulatedStreamArgs): UseSimulatedStreamResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const configRef = useRef(config);
  configRef.current = config;

  const closingRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const framesSentRef = useRef(0);
  const framesSentWindowRef = useRef(0);
  const resultsReceivedRef = useRef(0);
  const resultsWindowRef = useRef(0);

  const [videoDims, setVideoDims] = useState({ width: 0, height: 0 });
  const [boxes, setBoxes] = useState<StreamDetectionBox[]>([]);
  const [stats, setStats] = useState<StreamStats>(defaultStreamStats(streamId));

  // FIX: Use ref for connection state to avoid effect re-runs
  const connStateRef = useRef<StreamConnectionState>("idle");
  const lastErrorRef = useRef<string | null>(null);

  const setConnState = useCallback((s: StreamConnectionState, error?: string | null) => {
    connStateRef.current = s;
    if (error !== undefined) {
      lastErrorRef.current = error;
    }
    setStats((prev) => ({
      ...prev,
      connectionState: s,
      lastError: error !== undefined ? error : prev.lastError,
    }));
  }, []);

  // FIX: Stable ref for setConnState so useEffect doesn't re-run
  const setConnStateRef = useRef(setConnState);
  setConnStateRef.current = setConnState;

  useEffect(() => {
    if (!active) {
      return;
    }

    closingRef.current = false;
    reconnectAttemptsRef.current = 0;

    const video = videoRef.current;
    let onLoadedMeta: (() => void) | null = null;

    if (video) {
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      if (video.src !== videoUrl) {
        video.src = videoUrl;
      }

      onLoadedMeta = () => {
        setVideoDims({ width: video.videoWidth, height: video.videoHeight });
      };
      video.addEventListener("loadedmetadata", onLoadedMeta);
      video.play().catch((err) => {
        console.warn(`[${streamId}] video play failed`, err);
      });
    }

    function captureAndSend() {
      const video = videoRef.current;
      const ws = wsRef.current;
      if (!video || video.readyState < video.HAVE_CURRENT_DATA) return;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      if (!captureCanvasRef.current) {
        captureCanvasRef.current = document.createElement("canvas");
      }
      const canvas = captureCanvasRef.current;

      const maxWidth = configRef.current.maxWidth;
      let targetW = vw;
      let targetH = vh;
      if (maxWidth > 0 && vw > maxWidth) {
        const scale = maxWidth / vw;
        targetW = Math.max(1, Math.round(vw * scale));
        targetH = Math.max(1, Math.round(vh * scale));
      }

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, targetW, targetH);

      canvas.toBlob(
        (blob) => {
          if (blob && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(blob);
            framesSentRef.current += 1;
            framesSentWindowRef.current += 1;
          }
        },
        "image/jpeg",
        configRef.current.jpegQuality,
      );
    }

    function stopCaptureLoop() {
      if (captureTimerRef.current) {
        clearTimeout(captureTimerRef.current);
        captureTimerRef.current = null;
      }
    }

    function startCaptureLoop() {
      stopCaptureLoop();
      const tick = () => {
        captureAndSend();
        const fps = Math.max(1, configRef.current.targetFps);
        captureTimerRef.current = setTimeout(tick, 1000 / fps);
      };
      tick();
    }

    function scheduleReconnect() {
      if (closingRef.current) return;
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setConnStateRef.current("failed", "Max reconnect attempts reached");
        return;
      }
      const attempt = reconnectAttemptsRef.current;
      reconnectAttemptsRef.current += 1;
      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * 2 ** attempt,
        MAX_RECONNECT_DELAY_MS,
      );
      reconnectTimerRef.current = setTimeout(connect, delay);
    }

    function connect() {
      if (closingRef.current) return;
      setConnStateRef.current(reconnectAttemptsRef.current > 0 ? "reconnecting" : "connecting", null);

      const base = configRef.current.schedulerBaseUrl.replace(/\/+$/, "");
      const url = `${base}/ws/${encodeURIComponent(streamId)}`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        setConnStateRef.current("failed", String(err));
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setConnStateRef.current("connected", null);
        startCaptureLoop();
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        try {
          const data = JSON.parse(event.data);
          resultsReceivedRef.current += 1;
          resultsWindowRef.current += 1;

          type RawDetection = {
            x: number;
            y: number;
            dx: number;
            dy: number;
            label: string;
            confidence: number;
          };
          const detections: RawDetection[] = Array.isArray(data.detections)
            ? data.detections
            : [];
          const mapped: StreamDetectionBox[] = detections.map((d) => ({
            x1: d.x,
            y1: d.y,
            x2: d.x + d.dx,
            y2: d.y + d.dy,
            label: d.label,
            confidence: d.confidence,
          }));
          setBoxes(mapped);

          setStats((prev) => ({
            ...prev,
            lastDetectionCount: mapped.length,
            lastInferenceLatencyMs:
              typeof data.inferenceLatencyMs === "number"
                ? data.inferenceLatencyMs
                : prev.lastInferenceLatencyMs,
            nodeName: typeof data.nodeName === "string" ? data.nodeName : prev.nodeName,
          }));
        } catch {
          // Ignore malformed / non-JSON payloads.
        }
      };

      ws.onerror = () => {
        setConnStateRef.current(connStateRef.current, "WebSocket error");
      };

      ws.onclose = () => {
        stopCaptureLoop();
        wsRef.current = null;
        if (closingRef.current) {
          setConnStateRef.current("stopped", null);
          return;
        }
        scheduleReconnect();
      };
    }

    connect();

    return () => {
      closingRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      stopCaptureLoop();
      wsRef.current?.close();
      wsRef.current = null;

      if (video) {
        if (onLoadedMeta) video.removeEventListener("loadedmetadata", onLoadedMeta);
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      setConnStateRef.current("idle", null);
      setBoxes([]);
    };
  }, [active, videoUrl, streamId]); // FIX: Removed setConnState from deps

  // Roll frames-sent / results-received counters into per-second rates.
  useEffect(() => {
    const interval = setInterval(() => {
      setStats((prev) => ({
        ...prev,
        framesSent: framesSentRef.current,
        framesSentPerSec: framesSentWindowRef.current,
        resultsReceived: resultsReceivedRef.current,
        resultsPerSec: resultsWindowRef.current,
      }));
      framesSentWindowRef.current = 0;
      resultsWindowRef.current = 0;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    onStats?.(streamId, stats);
  }, [stats, streamId, onStats]);

  return { videoRef, videoDims, boxes, stats };
}