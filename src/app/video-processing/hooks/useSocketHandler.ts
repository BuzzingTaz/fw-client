import { useState, useEffect } from "react";
import { Socket } from "socket.io-client";
import { BoundingBox } from "@/app/video-processing/types/video-types";

// TODO: Update to match received data format from edge
// TODO: Rename hook
export function useSocketHandler(socket: Socket | null) {
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([
    { x1: 20, y1: 20, x2: 90, y2: 90, confidence: 0.5, label: "test" },
  ]);

  useEffect(() => {
    if (!socket) return;

    const onDetectionResults = (boxes: BoundingBox[]) => {
      setBoundingBoxes(boxes);
    };

    socket.on("video-processing-result", onDetectionResults);

    return () => {
      socket.off("video-processing-result");
    };
  }, [socket]);

  return { boundingBoxes };
}
