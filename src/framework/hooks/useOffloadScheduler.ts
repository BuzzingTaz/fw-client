"use client";
import { useEffect, useRef } from "react";
import { OffloadTransport } from "../transports/types";

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
        frameCountRef.current++;
        // Run the decision algorithm
        if (algorithm(imageData, frameCountRef.current)) {
          // Delegate: Call sendFrame on the transport.
          transport.sendFrame(canvas);
          console.log("offloaded frame", frameCountRef.current);
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
    };
  }, [offloadStream, transport, algorithm]);
}
