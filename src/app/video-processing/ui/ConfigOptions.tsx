import { BenchmarkConfig } from "@/app/video-processing/definitions";
import FpsDropdown from "@framework/ui/FpsDropdown";
import NetworkMethodDropdown from "@framework/ui/NetworkMethodDropdown";
import ResolutionDropdown from "@framework/ui/ResolutionDropdown";
import { Task } from "@framework/definitions";
import { useQuery } from "@tanstack/react-query";

const taskID = "video-processing";

interface ConfigOptionsProps {
  currentConfig: BenchmarkConfig;
  onConfigChange: (newConfig: BenchmarkConfig) => void;
}

export default function ConfigOptions({
  currentConfig,
  onConfigChange,
}: ConfigOptionsProps) {
  const {
    data: tasksOptions,
    isLoading,
    isError,
  } = useQuery<Task[]>({
    queryKey: [taskID],
    queryFn: () => fetch(`/api/tasks`).then((res) => res.json()),
  });

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { name, value, type } = e.target;

    let valueUpdated: any = value;
    if (name === "resolution") {
      valueUpdated =
        tasksOptions!
          .find((task) => task.taskID === taskID)
          ?.constraints.resolutions.find((res) => res.id === value) || null;
    } else if (type === "number") {
      valueUpdated = value === "" ? null : Number(value);
    }

    const newConfig = {
      ...currentConfig,
      [name]: valueUpdated,
    };

    onConfigChange(newConfig);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    onConfigChange({
      ...currentConfig,
      videoFile: file,
    });
  };

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-md mx-auto">
      <div className="flex flex-wrap gap-4">
        <div>
          <label htmlFor="userId" className="block text-sm font-medium">User ID (Run Name):</label>
          <input
            type="text"
            id="userId"
            name="userId"
            value={currentConfig.userId || ""}
            onChange={handleChange}
            placeholder="Auto-generated if empty"
            className="border rounded-md px-2 py-1 text-black"
          />
        </div>
        <div>
          <label htmlFor="edgeIp" className="block text-sm font-medium">Edge IP:</label>
          <input
            type="text"
            id="edgeIp"
            name="edgeIp"
            value={currentConfig.edgeIp || ""}
            onChange={handleChange}
            className="border rounded-md px-2 py-1 text-black"
          />
        </div>
        <div>
          <label htmlFor="duration" className="block text-sm font-medium">Duration (s):</label>
          <input
            type="number"
            id="duration"
            name="duration"
            value={currentConfig.duration || ""}
            onChange={handleChange}
            placeholder="e.g. 10"
            className="border rounded-md px-2 py-1 w-24 text-black"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <div>
          <label htmlFor="videoSource" className="block text-sm font-medium">Video Source:</label>
          <select
            id="videoSource"
            name="videoSource"
            value={currentConfig.videoSource}
            onChange={handleChange}
            className="border rounded-md px-2 py-1 text-black"
          >
            <option value="camera">Camera</option>
            <option value="file">Local File</option>
          </select>
        </div>
        {currentConfig.videoSource === "file" && (
          <div>
            <label htmlFor="videoFile" className="block text-sm font-medium">Select Video (MP4):</label>
            <input
              type="file"
              id="videoFile"
              name="videoFile"
              accept="video/mp4,video/*"
              onChange={handleFileChange}
              className="border rounded-md px-2 py-1"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div>
          <label htmlFor="resolution" className="block text-sm font-medium">Capture Resolution:</label>
          <ResolutionDropdown
            taskID={taskID}
            selectedResolution={currentConfig.resolution}
            onChange={handleChange as any}
          />
        </div>

        <div>
          <label htmlFor="fps" className="block text-sm font-medium">Capture FPS:</label>
          <FpsDropdown
            taskID={taskID}
            selectedFps={currentConfig.fps}
            onChange={handleChange as any}
          />
        </div>

        <div>
          <label htmlFor="offloadFps" className="block text-sm font-medium">Target Offload FPS:</label>
          <input
            type="number"
            id="offloadFps"
            name="offloadFps"
            value={currentConfig.offloadFps || ""}
            onChange={handleChange}
            placeholder="e.g. 15"
            className="border rounded-md px-2 py-1 w-24 text-black"
          />
        </div>

        <div>
          <label htmlFor="networkMethod" className="block text-sm font-medium">Network Method:</label>
          <NetworkMethodDropdown
            taskID={taskID}
            selectedNetworkMethod={currentConfig.networkMethod}
            onChange={handleChange as any}
          />
        </div>
      </div>
    </div>
  );
}
