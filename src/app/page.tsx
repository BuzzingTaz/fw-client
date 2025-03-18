"use client";
import { useEffect, useRef, useState } from "react";
import { startCamera } from "@/core/sensors/camera";
import { getTaskConstraints, Tasks } from "@/app/lib/tasks";

//const taskList = [{ id: "task1", title: "task1" }, { id: "task2", title: "task2" }];
// const taskList = Object.keys(Tasks).map((task) => ({ id: task, title: task }));
const taskList = Object.keys(Tasks);
const resolutionList = ["640x480", "1280x720", "1600x900", "1920x1080"];
const fpsList = [10, 30, 60];
const netMethodList = ["webrtc", "ws", "http"];

export default function Home() {
  const VideoRef = useRef<HTMLVideoElement>(null);
  const appRunning = useRef(false);
  const [selectedTask, setSelectedTask] = useState<string>(taskList[0]);
  const [selectedResolution, setSelectedResolution] = useState<string>(
    resolutionList[0],
  );
  const [selectedFps, setSelectedFps] = useState<number>(fpsList[0]);
  const [selectedNetMethod, setSelectedNetMethod] = useState<string>(
    netMethodList[0],
  );

  const setVideoRef = async (
    VideoRef: React.RefObject<HTMLVideoElement | null>,
    width: number,
    height: number,
    fps: number,
  ) => {
    console.log(width, height);
    if (VideoRef.current && VideoRef.current.srcObject) {
      console.log("Stopping stream");
      const stream = VideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
    }

    const mediaStream = await startCamera(width, height, fps);

    if (VideoRef.current) {
      console.log("Refreshing Camera");
      VideoRef.current.srcObject = mediaStream;
    }
  };

  const onStart = async () => {
    const supportedConstraints =
      navigator.mediaDevices.getSupportedConstraints();
    console.log(supportedConstraints);
    console.log(selectedTask);
    const taskConstraints = getTaskConstraints(selectedTask);

    const resolutionHeight = taskConstraints.video.height;
    const resolutionWidth = taskConstraints.video.width;
    const fps = taskConstraints.video.frameRate;

    await setVideoRef(VideoRef, resolutionWidth, resolutionHeight, fps);

    appRunning.current = true;
  };

  useEffect(() => {
    if (!appRunning.current) return;
    const width = Number(selectedResolution.split("x")[0]);
    const height = Number(selectedResolution.split("x")[1]);
    setVideoRef(VideoRef, width, height, selectedFps);
  }, [selectedResolution, selectedFps]);

  useEffect(() => {
    if (!appRunning.current) return;
    const taskConstraints = getTaskConstraints(selectedTask);
    const height = taskConstraints.video.height;
    const width = taskConstraints.video.width;
    const fps = taskConstraints.video.frameRate;
    setVideoRef(VideoRef, width, height, fps);
  }, [selectedTask]);

  return (
    <div>
      <video className="h-1/2 w-1/2" ref={VideoRef} autoPlay playsInline />
      <div className="flex flex-col">
        <div>
          <label>Task</label>
          <select
            className="border border-gray-900 rounded-md p-2 bg-gray-100"
            name="task Select"
            id="taskSelect"
            value={selectedTask}
            onChange={async (e) => {
              setSelectedTask(e.target.value);
            }}
          >
            {taskList.map((task) => (
              <option key={task} value={task}>
                {task}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Resolution</label>
          <select
            className="border border-gray-900 rounded-md p-2 bg-gray-100"
            name="resolution Select"
            id="resolutionSelect"
            value={selectedResolution}
            onChange={async (e) => {
              setSelectedResolution(e.target.value);
            }}
          >
            {resolutionList.map((resolution) => (
              <option key={resolution} value={resolution}>
                {resolution}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>FPS</label>
          <select
            className="border border-gray-900 rounded-md p-2 bg-gray-100"
            name="fps Select"
            id="fpsSelect"
            onChange={async (e) => {
              setSelectedFps(Number(e.target.value));
            }}
          >
            {fpsList.map((fps) => (
              <option key={fps} value={fps}>
                {fps}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Network Method</label>
          <select
            className="border border-gray-900 rounded-md p-2 bg-gray-100"
            name="netMethod Select"
            id="netMethodSelect"
            value={selectedNetMethod}
            onChange={async (e) => {
              setSelectedNetMethod(e.target.value);
            }}
          >
            {netMethodList.map((netMethod) => (
              <option key={netMethod} value={netMethod}>
                {netMethod}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        className="border border-gray-900 rounded-md p-2 bg-gray-100"
        onClick={async () => {
          await onStart();
        }}
      >
        Start
      </button>
    </div>
  );
}
