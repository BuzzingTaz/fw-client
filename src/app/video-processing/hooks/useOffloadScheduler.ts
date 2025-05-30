import { useCallback, useEffect, useRef } from "react";
import { Socket } from "socket.io-client";
import { VideoFrameData } from "@/app/video-processing/types/video-types";

const MAX_QUEUE_SIZE = 10; // Maximum number of frames to queue

// TODO: Try generalizing hook to be part of the library
export function useOffloadScheduler(
  socket: Socket | null,
  isConnected: boolean,
  sendInterval: number,
) {
  const frameQueue = useRef<VideoFrameData[]>([]);
  const isSendingRef = useRef(false);

  const sendFrame = useCallback((data: VideoFrameData) => {
    if (frameQueue.current.length >= MAX_QUEUE_SIZE) {
      const oldFrame = frameQueue.current.shift();
      oldFrame?.frame.close();
    }
    frameQueue.current.push(data);
    processQueue();
  }, []);

  const processQueue = useCallback(() => {
    if (isSendingRef.current || frameQueue.current.length === 0) return;
    if (!socket || !isConnected) return;
    isSendingRef.current = true;
    const frameData = frameQueue.current.shift();

    if (!frameData) {
      isSendingRef.current = false;
      return;
    }

    const { frame, timestamp, resolution } = frameData;

    // Convert VideoFrame to blob
    const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      frame.close();
      isSendingRef.current = false;
      return;
    }

    ctx.drawImage(frame, 0, 0);
    frame.close();

    canvas
      .convertToBlob({ type: "image/jpeg", quality: 0.8 })
      .then((blob) => {
        socket.emit("video-processing", {
          clientID: "client-1",
          image: blob,
          timestamp,
          resolution,
        });
        isSendingRef.current = false;
        processQueue(); // Process next frame in the queue
      })
      .catch((error) => {
        console.error("Failed to convert frame to blob:", error);
        isSendingRef.current = false;
      });
  }, [socket, isConnected]);

  useEffect(() => {
    if (!isConnected || !socket) return;

    const interval = setInterval(processQueue, 1000 / sendInterval);
    return () => clearInterval(interval);
  }, [isConnected, processQueue, sendInterval, socket]);

  useEffect(() => {
    if (!isConnected && frameQueue.current.length > 0) {
      // Clear queue when disconnected
      frameQueue.current.forEach((frame) => frame.frame.close());
      frameQueue.current = [];
    }
  }, [isConnected]);

  return { sendFrame };
}
