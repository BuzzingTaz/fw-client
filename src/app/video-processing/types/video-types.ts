import { VideoResolution } from "@/app/lib/definitions";

// TODO: Generalize types and move to lib

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  label: string;
};

export type VideoFrameData = {
  frame: VideoFrame;
  timestamp: number;
  resolution: VideoResolution;
};

