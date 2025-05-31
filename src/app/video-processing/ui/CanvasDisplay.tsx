import { useEffect, useRef, useState } from "react";
import { BoundingBox } from "@/app/video-processing/types/video-types";

interface CanvasDisplayProps {
  boundingBoxes: BoundingBox[];
  videoWidth: number | null;
  videoHeight: number | null;
}

export default function CanvasDisplay({
  boundingBoxes,
  videoWidth,
  videoHeight,
}: CanvasDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      setContainerSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (
      !canvas ||
      !videoWidth ||
      !videoHeight ||
      videoWidth === 0 ||
      videoHeight === 0
    )
      return;

    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    canvas.width = containerSize.width;
    canvas.height = containerSize.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / videoWidth;
    const scaleY = canvas.height / videoHeight;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (containerSize.width - videoWidth * scale) / 2;
    const offsetY = (containerSize.height - videoHeight * scale) / 2;

    ctx.strokeStyle = "#FF0000";
    ctx.lineWidth = 2;
    ctx.font = "14px Arial";
    ctx.fillStyle = "#FF0000";

    boundingBoxes.forEach((box) => {
      const scaledX = box.x * scaleX;
      const scaledY = box.y * scaleY;
      const scaledWidth = box.width * scaleX;
      const scaledHeight = box.height * scaleY;

      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);
      ctx.fillText(
        `${box.label} (${Math.round(box.confidence * 100)}%)`,
        box.x,
        box.y - 5,
      );
    });
  }, [boundingBoxes, videoWidth, videoHeight, containerSize]);

  return (
    <div ref={containerRef} className="absolute top-0 left-0 w-full h-full">
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full block pointer-events-none"
      />
    </div>
  );
}
