"use client";

import { useEffect, useRef, useState } from "react";
import { useSocket } from "@/app/lib/hooks/useSocket";
import { useCamera } from "@/app/lib/hooks/useCamera";
import { VideoResolution } from "@/app/lib/definitions";
import { useLocalFrameProcessor } from "./hooks/useLocalFrameProcessor";
import { useOffloadScheduler } from "./hooks/useOffloadScheduler";
import { useSocketHandler } from "./hooks/useSocketHandler";
import CameraControls from "./ui/CameraController";
import CanvasDisplay from "./ui/CanvasDisplay";

export default function Home() {
  const appRunning = useRef(false);
  const localCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const { socket, isConnected, transport } = useSocket();
  const { cameraTrack, startCamera, stopCamera } = useCamera();

  const { boundingBoxes } = useSocketHandler(socket);

  // TODO: Centralize location for kernels
  const { processFrame } = useLocalFrameProcessor([
    1 / 16,
    2 / 16,
    1 / 16,
    2 / 16,
    4 / 16,
    2 / 16,
    1 / 16,
    2 / 16,
    1 / 16,
  ]);
  const { enqueueFrame } = useOffloadScheduler(socket, isConnected, 10);

  const [selectedResolution, setSelectedResolution] =
    useState<VideoResolution | null>(null);
  const [selectedFps, setSelectedFps] = useState<number | null>(null);
  const [selectedNetworkMethod, setSelectedNetworkMethod] = useState<
    string | null
  >(null);
  const [actualResolution, setActualResolution] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // Track actual video resolution
  useEffect(() => {
    if (!cameraTrack) return;

    const updateResolution = () => {
      const settings = cameraTrack.getSettings();
      setActualResolution({
        width: settings.width || 0,
        height: settings.height || 0,
      });
    };

    updateResolution();

    const handleSettingsChange = () => updateResolution();
    cameraTrack.addEventListener("settingschange", handleSettingsChange);
    return () => {
      cameraTrack.removeEventListener("settingschange", handleSettingsChange);
    };
  }, [cameraTrack]);

  // Create cloned tracks for processing pipelines
  const [localTrack, setLocalTrack] = useState<MediaStreamTrack | null>(null);
  const [offloadTrack, setOffloadTrack] = useState<MediaStreamTrack | null>(
    null,
  );

  useEffect(() => {
    if (!cameraTrack) return;

    const local = cameraTrack.clone();
    const offload = cameraTrack.clone();

    setLocalTrack(local);
    setOffloadTrack(offload);
  }, [cameraTrack]);

  // Frame processing pipeline
  useEffect(() => {
    if (!localTrack || !localCanvasRef.current) return;

    const processor = new MediaStreamTrackProcessor({ track: localTrack });
    const reader = processor.readable.getReader();
    const canvas = localCanvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      console.error("Failed to get canvas context");
      return;
    }

    const processStream = async () => {
      while (appRunning.current) {
        try {
          const { done, value } = await reader.read();
          if (done) break;

          const imageData = await convertVideoFrameToImageData(value);
          const processedData = await processFrame(imageData);

          if (
            canvas.width !== value.displayWidth ||
            canvas.height !== value.displayHeight
          ) {
            canvas.width = value.displayWidth;
            canvas.height = value.displayHeight;
          }

          // Draw processed frame to canvas
          ctx.putImageData(processedData, 0, 0);

          value.close();
        } catch (error) {
          console.error("Frame processing error:", error);
        }
      }
    };

    processStream();

    return () => {
      reader.cancel();
    };
  }, [localTrack, processFrame]);

  // Offloading pipeline (sends frames to server)
  useEffect(() => {
    if (!offloadTrack) return;

    const processor = new MediaStreamTrackProcessor({ track: offloadTrack });
    const reader = processor.readable.getReader();

    const offloadStream = async () => {
      while (appRunning.current) {
        try {
          const { done, value } = await reader.read();
          if (done) break;

          // Send raw frame directly without processing
          await enqueueFrame({
            frame: value,
            timestamp: Date.now(),
            resolution: selectedResolution!,
          });
        } catch (error) {
          console.error("Offloading error:", error);
        }
      }
    };

    offloadStream();

    return () => {
      reader.cancel();
    };
  }, [offloadTrack, enqueueFrame, isConnected]);

  const handleStart = async (resolution: VideoResolution, fps: number) => {
    appRunning.current = true;
    try {
      await startCamera(resolution.width, resolution.height, fps);
    } catch (error) {
      appRunning.current = false;
      console.error("Failed to start camera:", error);
      return;
    }
  };

  const handleStop = () => {
    appRunning.current = false;
    stopCamera();
    localTrack?.stop();
    offloadTrack?.stop();
    setLocalTrack(null);
    setOffloadTrack(null);
  };

  return (
    <div className="container mx-auto p-4">
      <CameraControls
        selectedResolution={selectedResolution}
        selectedFps={selectedFps}
        selectedNetworkMethod={selectedNetworkMethod}
        onResolutionChange={setSelectedResolution}
        onFpsChange={setSelectedFps}
        onNetworkMethodChange={setSelectedNetworkMethod}
        onStart={handleStart}
      />
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

      <div className="mt-4 text-center">
        Connection Status: {isConnected ? "Connected" : "Disconnected"}
      </div>
    </div>
  );
}

// Helper function
async function convertVideoFrameToImageData(
  frame: VideoFrame,
): Promise<ImageData> {
  const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
  const ctx = canvas.getContext("2d");
  ctx?.drawImage(frame, 0, 0);
  return (
    ctx?.getImageData(0, 0, canvas.width, canvas.height) ?? new ImageData(1, 1)
  );
}
