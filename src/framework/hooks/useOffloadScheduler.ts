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

  useEffect(() => {
    if (!offloadStream) return;

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = offloadStream;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      console.error("failed to get context");
      return;
    }

    let animationFrameId: number;

    const processFrame = () => {
      if (video.paused || video.ended || !ctx || !video.videoWidth) {
        animationFrameId = requestAnimationFrame(processFrame);
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      frameCountRef.current++;

      // 2. Run the decision algorithm
      if (algorithm(imageData, frameCountRef.current)) {
        // 3. Delegate: Call sendFrame on the transport.
        transport.sendFrame(canvas);
      }

      animationFrameId = requestAnimationFrame(processFrame);
    };

    const handleMetadataLoaded = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      animationFrameId = requestAnimationFrame(processFrame);
    };

    video.addEventListener("loadedmetadata", handleMetadataLoaded);
    video.play().catch((error) => {
      console.error("Video play failed:", error);
    });

    return () => {
      cancelAnimationFrame(animationFrameId);
      video.removeEventListener("loadedmetadata", handleMetadataLoaded);
      video.pause();
      if (video.srcObject) {
        video.srcObject = null;
      }
    };
  }, [offloadStream, transport, algorithm]);
}
