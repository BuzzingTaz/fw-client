"use client";

// import cv from "opencv4nodejs";
import { useEffect, useRef, useState } from "react";
import { startCamera } from "@/framework/sensors/camera";
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
    const videoTrack = mediaStream.getVideoTracks()[0];
    const processedTrack = await processVideoTrack(videoTrack);
    const processedStream = new MediaStream([processedTrack]);

    if (VideoRef.current) {
      console.log("Refreshing Camera");
      VideoRef.current.srcObject = processedStream;
    }
  };

  const processVideoTrack = (videoTrack: MediaStreamTrack) => {
    return new Promise<MediaStreamTrack>((resolve) => {
      const videoElement = document.createElement("video");
      videoElement.srcObject = new MediaStream([videoTrack]);
      videoElement.play();

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      videoElement.addEventListener("loadedmetadata", () => {
        canvas.width = videoElement.videoWidth / 2; // Resize to half the width
        canvas.height = videoElement.videoHeight / 2; // Resize to half the height

        // Create a new MediaStreamTrack from the canvas
        const processedStream = canvas.captureStream();
        const processedTrack = processedStream.getVideoTracks()[0];

        // Use the processed track (e.g., display it or send it over WebRTC)
        resolve(processedTrack);
        processFrame();
      });

      function applyKernel(imageData: ImageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;

        // Example: Apply a simple edge detection kernel
        // const kernel = [-1, -1, -1, -1, 8, -1, -1, -1, -1];
        const kernel = [
          1 / 16,
          2 / 16,
          1 / 16,
          2 / 16,
          4 / 16,
          2 / 16,
          1 / 16,
          2 / 16,
          1 / 16,
        ];

        const tempData = new Uint8ClampedArray(data.length);

        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            let r = 0,
              g = 0,
              b = 0;

            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const pixelIndex = ((y + ky) * width + (x + kx)) * 4;
                const kernelIndex = (ky + 1) * 3 + (kx + 1);

                r += data[pixelIndex] * kernel[kernelIndex];
                g += data[pixelIndex + 1] * kernel[kernelIndex];
                b += data[pixelIndex + 2] * kernel[kernelIndex];
              }
            }

            const outputIndex = (y * width + x) * 4;
            tempData[outputIndex] = r;
            tempData[outputIndex + 1] = g;
            tempData[outputIndex + 2] = b;
            tempData[outputIndex + 3] = data[outputIndex + 3]; // Preserve alpha
          }
        }

        return new ImageData(tempData, width, height);
      }

      // function applyKernelCV(mat: cv.Mat) {
      //   // Example: Apply a Gaussian blur
      //   const blurredMat = mat.gaussianBlur(new cv.Size(5, 5), 0);
      //
      //   // Example: Apply a Sobel edge detection kernel
      //   const sobelX = blurredMat.sobel(cv.CV_8U, 1, 0);
      //   const sobelY = blurredMat.sobel(cv.CV_8U, 0, 1);
      //   const sobelMat = sobelX.add(sobelY);
      //
      //   return sobelMat;
      // }

      function processFrame() {
        ctx!.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        const imageData = ctx!.getImageData(0, 0, canvas.width, canvas.height);

        // const mat = cv.matFromImageData(imageData);

        // const processedMat = applyKernelCV(mat);

        // Convert processed Mat back to ImageData
        // const processedImageData = new ImageData(
        //   new Uint8ClampedArray(processedMat.getData()),
        //   processedMat.cols,
        //   processedMat.rows,
        // Draw the processed frame back to the canvas
        // ctx!.putImageData(processedImageData, 0, 0);

        const processedImageData = applyKernel(imageData);
        ctx!.putImageData(processedImageData, 0, 0);

        requestAnimationFrame(processFrame); // Continuously process frames
      }
    });
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
