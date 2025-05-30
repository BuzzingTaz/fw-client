import { useState, useEffect } from "react";
import { Socket } from "socket.io-client";
import { BoundingBox } from "@/app/video-processing/types/video-types";

// TODO: Update to match received data format from edge
// TODO: Rename hook
export function useSocketHandler(socket: Socket | null) {
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([
    { x: 20, y: 20, width: 20, height: 20, confidence: 0.5, label: "test" },
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
