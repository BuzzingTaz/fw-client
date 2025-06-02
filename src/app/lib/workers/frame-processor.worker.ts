import { applyKernel } from "@/app/lib/image-processing";

declare const self: Worker;

self.onmessage = (e) => {
  const { frame, kernel } = e.data;
  const processedData = applyKernel(frame, kernel);
  self.postMessage(processedData, [processedData.data.buffer]);
};
