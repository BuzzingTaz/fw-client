"use client";

import { useState, useEffect, useRef } from "react";
import {
  useCamera,
  useOffloadScheduler,
  useLocalFrameProcessor,
} from "@framework/hooks";
import useTransport from "@framework/transports/useTransport";
import CanvasDisplay from "@/app/video-processing/ui/CanvasDisplay";
import { BoundingBox } from "../video-processing/types/video-types";
import ConfigOptions from "./ui/ConfigOptions";
import { BenchmarkConfig } from "./definitions";
import { useTrackActualResolution } from "./hooks/useTrackActualResolution";

// An algorithm from the app that sends every 15th frame
const every15thFrame = (frame: ImageData, frameCount: number) =>
  frameCount % 15 === 0;

export default function BenchmarkPage() {
  const [benchmarkConfig, setBenchmarkConfig] = useState<BenchmarkConfig>({
    resolution: null,
    fps: null,
    networkMethod: "none",
    offloadScheduler: null,
    taskScheduler: null,
    taskSchedulerBufferSize: null,
  });
  const handleBenchmarkConfigChange = (newConfig: BenchmarkConfig) => {
    setBenchmarkConfig(newConfig);
    console.debug("Benchmark config updated:", newConfig);
  };

  // Get basic camera functions and stream
  const {
    cameraStream: rawCameraStream,
    startCamera,
    stopCamera,
  } = useCamera();

  // Create clones of camera stream for local and offloaded processing
  const localCameraStream = useRef<MediaStream | null>(null);
  const offloadCameraStream = useRef<MediaStream | null>(null);
  useEffect(() => {
    if (!rawCameraStream) {
      localCameraStream.current = null;
      offloadCameraStream.current = null;
      return;
    }
    localCameraStream.current = rawCameraStream.clone();
    offloadCameraStream.current = rawCameraStream.clone();
  }, [rawCameraStream]);

  // Track actual resolution of the camera stream
  const { actualResolution } = useTrackActualResolution(rawCameraStream);

  // Instantiate the WebRTC transport
  const { pc, offloadTransport } = useTransport(benchmarkConfig.networkMethod);

  // Run the scheduler.
  useOffloadScheduler(
    offloadCameraStream.current,
    offloadTransport,
    every15thFrame,
  );

  // Process the local camera stream with a simple frame processor (that does nothing here)
  const { localProcessedStream } = useLocalFrameProcessor(
    localCameraStream.current,
    (data) => data,
  );

  // Example bounding boxes to overlay on the video
  const boundingBoxes: BoundingBox[] = [
    {
      x1: 10,
      y1: 10,
      x2: 100,
      y2: 100,
      confidence: 1,
      label: "hello",
    },
  ];

  const handleStart = async () => {
    if (
      !benchmarkConfig.resolution ||
      !benchmarkConfig.fps ||
      !benchmarkConfig.networkMethod
    ) {
      alert("Please select resolution, fps, and network method.");
      return;
    }
    await startCamera(
      benchmarkConfig.resolution?.width || 640,
      benchmarkConfig.resolution?.height || 480,
      benchmarkConfig.fps || 30,
    );
    await handleConnect();
  };

  const handleConnect = async () => {
    await offloadTransport.connect({
      serverUrl: "ws://localhost:9999/signal",
    });
  };

  const localCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!rawCameraStream || !localCanvasRef.current) return;

    const video = document.createElement("video");
    video.srcObject = rawCameraStream;
    video.play();

    const canvas = localCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      requestAnimationFrame(draw);
    };
    draw();

    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, [rawCameraStream]);

  return (
    <div>
      <h1>Video Processing Benchmarks</h1>
      <div className="container mx-auto p-4">
        <h2>Configuration options</h2>
        <ConfigOptions
          currentConfig={benchmarkConfig}
          onConfigChange={handleBenchmarkConfigChange}
        />
        <button
          onClick={handleStart}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md"
        >
          Start Benchmark
        </button>
      </div>
      <div>
        <h2>Debug info</h2>
        <div className="mt-4 text-center">
          Connection Status: {offloadTransport?.connectionState}
        </div>
      </div>
      <div>
        <h2>Video Displays</h2>
        <div className="relative w-full max-w-4xl aspect-video bg-gray-900 rounded-lg overflow-hidden">
          <canvas
            ref={localCanvasRef}
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
