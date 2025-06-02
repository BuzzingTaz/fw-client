import React from "react";

import { Task, VideoResolution } from "@/app/lib/definitions";
import { useQuery } from "@tanstack/react-query";

interface ResolutionDropdownProps {
  taskID: string;
  selectedResolution: VideoResolution | null;
  onChange: (resolution: VideoResolution) => void;
}

const ResolutionDropdown: React.FC<ResolutionDropdownProps> = ({
  taskID,
  selectedResolution,
  onChange,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = resolutionList?.find(
      (res) => `${res.width}x${res.height}` === e.target.value,
    );
    if (selected) {
      onChange(selected);
    }
  };

  const {
    data: tasks,
    isLoading,
    isError,
  } = useQuery<Task[]>({
    queryKey: [taskID],
    queryFn: () => fetch(`/api/tasks`).then((res) => res.json()),
  });

  if (isLoading) {
    return <div>Loading resolution options...</div>;
  }
  if (isError) {
    return <div>Error loading resolution options</div>;
  }

  const resolutionList = tasks!.find((task) => task.taskID === taskID)
    ?.constraints.resolutions;

  return (
    <select
      value={
        selectedResolution
          ? `${selectedResolution.width}x${selectedResolution.height}`
          : ""
      }
      onChange={handleChange}
      className="border border-gray-900 rounded-md p-2 bg-gray-100"
    >
      {resolutionList!.map((res) => (
        <option
          key={`${res.width}x${res.height}`}
          value={`${res.width}x${res.height}`}
        >
          {res.label || `${res.width}x${res.height} (${res.aspectRatio})`}
        </option>
      ))}
    </select>
  );
};

export default ResolutionDropdown;
