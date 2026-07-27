"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  useCamera,
  useOffloadScheduler,
  useLocalFrameProcessor,
  useTelemetryStats,
} from "@framework/hooks";
import useTransport from "@framework/transports/useTransport";
import CanvasDisplay from "@/app/video-processing/ui/CanvasDisplay";
import { BoundingBox } from "../video-processing/types/video-types";
import ConfigOptions from "./ui/ConfigOptions";
import { BenchmarkConfig } from "./definitions";
import { useTrackActualResolution } from "./hooks/useTrackActualResolution";
import { useMediaStreamToCanvasRef } from "./hooks/useMediaStreamToCanvas";
import { telemetryStore } from "@/framework/telemetry/TelemetryStore";

export default function BenchmarkPage() {
  const [benchmarkConfig, setBenchmarkConfig] = useState<BenchmarkConfig>({
    resolution: null,
    fps: 30,
    networkMethod: "none",
    offloadScheduler: null,
    taskScheduler: null,
    taskSchedulerBufferSize: null,
    edgeIp: "10.119.207.216",
    videoSource: "camera",
    videoFile: null,
    duration: 120,
    offloadFps: 15,
    userId: "",
  });

  const [benchmarks, setBenchmarks] = useState<string[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const handleBenchmarkConfigChange = (newConfig: BenchmarkConfig) => {
    setBenchmarkConfig(newConfig);
  };

  const { cameraStream, startCamera, stopCamera } = useCamera();
  // const { videoStream, startLocalVideo, stopLocalVideo } = useLocalVideo();

  // const activeStream = benchmarkConfig.videoSource === "camera" ? cameraStream : videoStream;
  const activeStream = cameraStream


  const localStreamRef = useRef<MediaStream | null>(null);
  const offloadStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!activeStream) {
      localStreamRef.current = null;
      offloadStreamRef.current = null;
      return;
    }
    localStreamRef.current = activeStream.clone();
    offloadStreamRef.current = activeStream.clone();
  }, [activeStream]);

  const { actualResolution } = useTrackActualResolution(activeStream);
  const { pc, offloadTransport } = useTransport(benchmarkConfig.networkMethod);
  const pendingDisplayQueue = useRef<number[]>([]);

  // Timing based Offload Algorithm
  const lastOffloadTimeRef = useRef<number>(0);
  const timingBasedOffload = useCallback(
    (frame: ImageData, frameCount: number) => {
      const offFps = benchmarkConfig.offloadFps || 15;
      const targetInterval = 1000 / offFps;
      const now = performance.now();

      if (now - lastOffloadTimeRef.current >= targetInterval) {
        lastOffloadTimeRef.current = now;
        return true;
      }
      return false;
    },
    [benchmarkConfig.offloadFps]
  );

  useOffloadScheduler(offloadStreamRef.current, offloadTransport, timingBasedOffload);

  const { localProcessedStream } = useLocalFrameProcessor(
    localStreamRef.current,
    (data) => data
  );

  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);

  useEffect(() => {
    const t = performance.now();
    while (pendingDisplayQueue.current.length > 0) {
      const frameId = pendingDisplayQueue.current.shift();
      if (frameId !== undefined) {
        telemetryStore.logEvent(frameId, "display", t);
      }
    }
  }, [boundingBoxes]);

  const fetchBenchmarks = async () => {
    if (!benchmarkConfig.edgeIp) return;
    try {
      const res = await fetch(`http://${benchmarkConfig.edgeIp}:8888/api/benchmarks/list`);
      if (res.ok) {
        const dirs: string[] = await res.json() || [];
        setBenchmarks(dirs.sort().reverse());
      }
    } catch (err) {
      console.error("Failed to fetch benchmarks", err);
    }
  };

  useEffect(() => {
    fetchBenchmarks();
  }, [benchmarkConfig.edgeIp]);

  const handleStart = async () => {
    if (!benchmarkConfig.resolution || !benchmarkConfig.fps || !benchmarkConfig.networkMethod) {
      alert("Please select resolution, fps, and network method.");
      return;
    }

    if (benchmarkConfig.videoSource === "file" && !benchmarkConfig.videoFile) {
      alert("Please select a video file.");
      return;
    }

    // 1. Generate run ID with local timestamp
    const now = new Date();
    const timestamp = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .replace(/[-:T.]/g, '')
      .slice(0, 14);
    const baseId = benchmarkConfig.userId && benchmarkConfig.userId.trim() !== ""
      ? benchmarkConfig.userId.trim()
      : "Run";
    const runId = `${timestamp}_${baseId}`;

    setActiveRunId(runId);

    // 2. Clear local telemetry store
    telemetryStore.clear();
    setBoundingBoxes([]);

    // 3. Start Media Stream
    // if (benchmarkConfig.videoSource === "camera") {
      await startCamera(
        benchmarkConfig.resolution?.width || 640,
        benchmarkConfig.resolution?.height || 480,
        benchmarkConfig.fps || 30
      );
    // } else {
    //   await startLocalVideo(benchmarkConfig.videoFile!);
    // }

    // 4. Connect WebRTC using unique run ID
    await handleConnect(runId);

    // 5. Setup timeout if duration is specified
    if (benchmarkConfig.duration) {
      setTimeout(async () => {
        handleStop(runId);
      }, benchmarkConfig.duration * 1000);
    }
  };

  const handleStop = async (runId: string) => {
    // Stop streams
    // if (benchmarkConfig.videoSource === "camera") {
      stopCamera();
    // } else {
    //   stopLocalVideo();
    // }
    offloadTransport.disconnect();

    // Generate Client Telemetry Link
    await generateClientTelemetry(runId);

    // Save Edge Telemetry
    try {
      await fetch(`http://${benchmarkConfig.edgeIp}:8888/api/benchmarks/edge/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: runId })
      });
      fetchBenchmarks();
    } catch (err) {
      console.error("Failed to save edge telemetry", err);
    }
    setActiveRunId(null);
  };

  const handleConnect = async (runId: string) => {
    await offloadTransport.connect({
      serverUrl: `ws://${benchmarkConfig.edgeIp}:9999/initiate/webrtc/${runId}`,
    });

    offloadTransport.onDataReceived((data: any) => {
      const t = performance.now();
      const frameId = data.frameId;
      if (frameId !== undefined) {
        telemetryStore.logEvent(frameId, "receive", t);
        pendingDisplayQueue.current.push(frameId);
      }
      setBoundingBoxes(data.detections || []);
    });
  };

  const generateClientTelemetry = async (runId: string) => {
    const data = telemetryStore.getData();
    if (data.length === 0) return;

    const eventTypes = telemetryStore.getEventTypes();

    let csv = `frameId,${eventTypes.join(',')}\n`;
    data.forEach(row => {
      let csvRow = `${row.id}`;
      eventTypes.forEach(evt => {
        csvRow += `,${row.events[evt] || ""}`;
      });
      csv += csvRow + "\n";
    });

    try {
      await fetch(`http://${benchmarkConfig.edgeIp}:8888/api/benchmarks/client/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: runId, csv })
      });
      fetchBenchmarks();
    } catch (err) {
      console.error("Failed to save client telemetry", err);
    }
  };

  const rawCanvasRef = useMediaStreamToCanvasRef(activeStream);
  const telemetryStats = useTelemetryStats(50);

  return (
    <div>
      <h1>Video Processing Benchmarks</h1>
      <div className="container mx-auto p-4">
        <h2>Configuration Options</h2>
        <ConfigOptions
          currentConfig={benchmarkConfig}
          onConfigChange={handleBenchmarkConfigChange}
        />

        <div className="flex gap-4 mt-4">
          <button
            onClick={handleStart}
            disabled={!!activeRunId}
            className={`px-4 py-2 text-white rounded-md ${activeRunId ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'}`}
          >
            Start Benchmark
          </button>

          <button
            onClick={() => activeRunId && handleStop(activeRunId)}
            disabled={!activeRunId}
            className={`px-4 py-2 text-white rounded-md ${!activeRunId ? 'bg-gray-400' : 'bg-red-500 hover:bg-red-600'}`}
          >
            Stop Benchmark
          </button>
        </div>
      </div>

      <div className="container mx-auto p-4 grid grid-cols-3 gap-8">
        <div>
          <h2>Real-Time Stats</h2>
          <div className="bg-gray-800 text-white p-4 rounded-md space-y-2 mt-4">
            <p>Connection: <span className="font-bold text-blue-400">{offloadTransport?.connectionState}</span></p>
            <p>Send FPS: <span className="font-bold text-green-400">{telemetryStats.sendFps}</span></p>
            <p>Receive FPS: <span className="font-bold text-purple-400">{telemetryStats.receiveFps}</span></p>
            <p>Avg Latency: <span className="font-bold text-yellow-400">{telemetryStats.avgLatency.toFixed(2)} ms</span></p>
          </div>
        </div>

        <div>
          <h2>Saved Benchmarks</h2>
          <ul className="mt-4 max-h-48 overflow-y-auto border p-2 rounded-md">
            {benchmarks.length === 0 ? (
              <li className="text-gray-500 text-sm">No benchmarks found.</li>
            ) : (
              benchmarks.map((dir) => (
                <li key={dir} className="flex justify-between items-center mb-2">
                  <span className="text-sm">{dir}</span>
                  <a
                    href={`/video-processing/benchmarks/${dir}?edgeIp=${benchmarkConfig.edgeIp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline text-sm ml-4"
                  >
                    View
                  </a>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className="container mx-auto p-4">
        <h2>Video Displays</h2>
        <div className="relative w-full max-w-4xl aspect-video bg-gray-900 rounded-lg overflow-hidden mt-4">
          <canvas
            ref={rawCanvasRef}
            className="absolute top-0 left-0 w-full h-full"
          />
          <CanvasDisplay
            boundingBoxes={boundingBoxes}
            videoWidth={actualResolution?.width || null}
            videoHeight={actualResolution?.height || null}
          />
        </div>
      </div>
    </div>
  );
}
