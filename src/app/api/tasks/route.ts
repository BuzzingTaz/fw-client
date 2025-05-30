import type { Task } from "@/app/lib/definitions";
import { NextResponse } from "next/server";

// TODO: Move to a db
const tasks: Task[] = [
  {
    taskID: "video-processing",
    name: "Video Processing",
    description: "...",
    constraints: {
      resolutions: [
        { width: 640, height: 480, aspectRatio: "4:3", label: "480p (SD)" },
        { width: 1280, height: 720, aspectRatio: "16:9", label: "720p (HD)" },
        {
          width: 1920,
          height: 1080,
          aspectRatio: "16:9",
          label: "1080p (Full HD)",
        },
        {
          width: 2560,
          height: 1440,
          aspectRatio: "16:9",
          label: "1440p (QHD)",
        },
        { width: 3840, height: 2160, aspectRatio: "16:9", label: "2160p (4K)" },
      ],
      fps: [10, 30, 60],
      networkMethods: ["http", "socket.io", "webrtc"],
    },
  },
  {
    taskID: "real-time-chat",
    name: "Real Time Chat",
    description: "...",
    constraints: {
      resolutions: [
        { width: 640, height: 480, aspectRatio: "4:3", label: "480p (SD)" },
        { width: 1280, height: 720, aspectRatio: "16:9", label: "720p (HD)" },
        {
          width: 1920,
          height: 1080,
          aspectRatio: "16:9",
          label: "1080p (Full HD)",
        },
        {
          width: 2560,
          height: 1440,
          aspectRatio: "16:9",
          label: "1440p (QHD)",
        },
        { width: 3840, height: 2160, aspectRatio: "16:9", label: "2160p (4K)" },
      ],
      fps: [10, 30, 60],
      networkMethods: ["http", "socket.io", "webrtc"],
    },
  },
];

export async function GET() {
  return NextResponse.json(tasks);
}
