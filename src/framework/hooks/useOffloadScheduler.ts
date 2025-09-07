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
  rawStream: MediaStream | null,
  transport: OffloadTransport,
  algorithm: OffloadDecisionAlgorithm,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const processingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameCountRef = useRef(0);

  useEffect(() => {
    if (!rawStream) return;

    if (!videoRef.current) {
      videoRef.current = document.createElement("video");
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
    }
    if (!processingCanvasRef.current) {
      processingCanvasRef.current = document.createElement("canvas");
    }

    const video = videoRef.current;
    video.srcObject = rawStream;
    console.log(rawStream.getTracks());
    video.play();

    const canvas = processingCanvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    let animationFrameId: number;

    const processFrame = () => {
      if (video.paused || video.ended || !ctx) {
        animationFrameId = requestAnimationFrame(processFrame);
        return;
      }

      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      // 1. Draw frame to a canvas to get pixel data
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

    animationFrameId = requestAnimationFrame(processFrame);

    return () => {
      cancelAnimationFrame(animationFrameId);
      video.srcObject = null;
    };
  }, [rawStream, transport, algorithm]);
}
