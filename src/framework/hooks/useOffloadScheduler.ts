"use client";
import { useEffect, useRef } from "react";
import { OffloadTransport } from "../transports/types";
import { telemetryStore } from "../telemetry/TelemetryStore";

type OffloadDecisionAlgorithm = (
  frame: ImageData,
  frameCount: number,
) => boolean;

/**
 * A hook that sits between a raw MediaStream and an OffloadTransport,
 * applying a decision algorithm to each frame and delegating the send action.
 */
export function useOffloadScheduler(
  offloadStream: MediaStream | null,
  transport: OffloadTransport,
  algorithm: OffloadDecisionAlgorithm,
) {
  const frameCountRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const transportRef = useRef(transport);
  const algorithmRef = useRef(algorithm);

  useEffect(() => {
    transportRef.current = transport;
  }, [transport]);

  useEffect(() => {
    algorithmRef.current = algorithm;
  }, [algorithm]);

  useEffect(() => {
    if (!offloadStream) return;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      console.error("failed to get context");
      return;
    }

    if (!videoRef.current) {
      videoRef.current = document.createElement("video");
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
      videoRef.current.autoplay = true;
    }

    const video = videoRef.current;
    video.srcObject = offloadStream;

    let animationFrameId: number;
    const processFrame = () => {
      if (video.readyState >= video.HAVE_ENOUGH_DATA) {
        if (
          canvas.width !== video.videoWidth ||
          canvas.height !== video.videoHeight
        ) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // NOTE: Maybe look at this later; the following lines are the only differences from the useMediaStreamToCanvas hook
        // Try modularizing
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const currentFrameCount = ++frameCountRef.current;
        telemetryStore.logEvent(currentFrameCount, "capture", performance.now());

        // Run the decision algorithm
        const currentTransport = transportRef.current;
        const currentAlgorithm = algorithmRef.current;

        if (currentTransport.connectionState === 'connected' && currentAlgorithm(imageData, currentFrameCount)) {
          // Delegate: Call sendFrame on the transport.
          currentTransport.sendFrame(canvas, currentFrameCount);
          telemetryStore.logEvent(currentFrameCount, "offload", performance.now());
          console.log("offloaded frame", currentFrameCount);
        }
      }
      animationFrameId = requestAnimationFrame(processFrame);
    };

    const handleLoadedMetadata = () => {
      video.play().then(() => {
        processFrame();
      }).catch((error) => {
        console.error("Video play failed in Offload Scheduler:", error);
      });
    };


    // Wait for metadata to load before playing
    // video.play() can fail if called before metadata is loaded
    if (video.readyState >= video.HAVE_METADATA) {
      handleLoadedMetadata();
    } else {
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      video.pause();
      video.srcObject = null;
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [offloadStream]);
}
