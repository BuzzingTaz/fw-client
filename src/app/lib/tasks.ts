import { TaskDescription } from "@/app/lib/definitions";

//All tasks with associated inherent properties
//Should be communicated by the cloud
export const Tasks: Record<string, TaskDescription> = {
  task1: {
    video: {
      width: 1920,
      height: 1080,
      frameRate: 30,
    },
    networkMethod: "webrtc",
  },
  task2: {
    video: {
      width: 1280,
      height: 720,
      frameRate: 30,
    },
    networkMethod: "ws",
  },
  default: {
    video: {
      width: 640,
      height: 480,
      frameRate: 30,
    },
    networkMethod: "http",
  },
};

// make async
export const getTaskConstraints = (task: string) => {
  try {
    return Tasks[task];
  } catch {
    console.log("Defaulting to default");
  }
  return Tasks["default"];
};
