"use client";

import { VideoResolution } from "@/app/lib/definitions";
import ResolutionDropdown from "@/app/ui/components/ResolutionDropdown";
import FpsDropdown from "@/app/ui/components/FpsDropdown";
import NetworkMethodDropdown from "@/app/ui/components/NetworkMethodDropdown";

interface CameraControlsProps {
  selectedResolution: VideoResolution | null;
  selectedFps: number | null;
  selectedNetworkMethod: string | null;
  onResolutionChange: (resolution: VideoResolution | null) => void;
  onFpsChange: (fps: number | null) => void;
  onNetworkMethodChange: (method: string | null) => void;
  onStart: () => void;
}

const taskID = "video-processing";

export default function CameraControls({
  selectedResolution,
  selectedFps,
  selectedNetworkMethod,
  onResolutionChange,
  onFpsChange,
  onNetworkMethodChange,
  onStart,
}: CameraControlsProps) {
  const handleStartClick = () => {
    if (selectedResolution && selectedFps) {
      onStart();
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-100 rounded-lg shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Resolution
          </label>
          <ResolutionDropdown
            taskID={taskID}
            selectedResolution={selectedResolution}
            onChange={onResolutionChange}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            FPS
          </label>
          <FpsDropdown
            taskID={taskID}
            selectedFps={selectedFps}
            onChange={onFpsChange}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Network Method
          </label>
          <NetworkMethodDropdown
            taskID={taskID}
            selectedNetworkMethod={selectedNetworkMethod}
            onChange={onNetworkMethodChange}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleStartClick}
          disabled={!selectedResolution || !selectedFps}
          className={`px-6 py-2 rounded-md font-medium text-white transition-colors
            ${
              selectedResolution && selectedFps
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-gray-400 cursor-not-allowed"
            }`}
        >
          Start Processing
        </button>
      </div>
    </div>
  );
}
