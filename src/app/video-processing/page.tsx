"use client";

import { VideoResolution } from "@framework/definitions";
import { useState, useEffect, useRef } from "react";
import { useCamera, useOffloadScheduler } from "@framework/hooks";
import { useWebRTCTransport } from "@framework/transports";
// import { VideoCanvas } from "@framework/components";
import CameraControls from "@/app/video-processing/ui/CameraController";
import CanvasDisplay from "@/app/video-processing/ui/CanvasDisplay";
import { BoundingBox } from "../video-processing/types/video-types";

// An algorithm from the app that sends every 15th frame
const every15thFrame = (frame: ImageData, frameCount: number) =>
  frameCount % 15 === 0;

export default function BenchmarkPage() {
  // Get the raw camera stream
  const {
    cameraStream: rawCameraStream,
    startCamera,
    stopCamera,
  } = useCamera();

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

  // Track actual video resolution (mediaDevices.getUserMedia may not respect constraints)
  useEffect(() => {
    if (!rawCameraStream) return;
    const cameraTrack = rawCameraStream.getVideoTracks()[0];
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
  }, [rawCameraStream]);

  // Instantiate the WebRTC transport
  const webrtcTransport = useWebRTCTransport();

  // Run the scheduler.
  useOffloadScheduler(rawCameraStream, webrtcTransport, every15thFrame);

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

  const handleConnect = async () => {
    if (!selectedResolution || !selectedFps || !selectedNetworkMethod) {
      alert("Please select resolution, fps, and network method.");
      return;
    }
    await startCamera(selectedResolution.width, selectedResolution.height, selectedFps);
    await webrtcTransport.connect({
      signalingServerUrl: "ws://localhost:8080/signal",
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
      <h1>WebRTC Offload Scheduling</h1>
      <div className="container mx-auto p-4">
        <CameraControls
          selectedResolution={selectedResolution}
          selectedFps={selectedFps}
          selectedNetworkMethod={selectedNetworkMethod}
          onResolutionChange={setSelectedResolution}
          onFpsChange={setSelectedFps}
          onNetworkMethodChange={setSelectedNetworkMethod}
          onStart={handleConnect}
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
          Connection Status: {webrtcTransport.connectionState}
        </div>
      </div>
    </div>
  );
}
