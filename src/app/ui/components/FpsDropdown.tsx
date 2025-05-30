import { Task } from "@/app/lib/definitions";
import { useQuery } from "@tanstack/react-query";

interface FpsDropdownProps {
  taskID: string;
  selectedFps: number | null;
  onChange: (fps: number) => void;
}

export default function FpsDropdown({
  taskID,
  selectedFps,
  onChange,
}: FpsDropdownProps) {
  const {
    data: tasks,
    isLoading,
    isError,
  } = useQuery<Task[]>({
    queryKey: [taskID],
    queryFn: () => fetch(`/api/tasks`).then((res) => res.json()),
  });

  if (isLoading) {
    return <div>Loading FPS options...</div>;
  }

  if (isError) {
    return <div>Error loading FPS options</div>;
  }

  const fpsListFromTask = tasks!.find((task) => task.taskID === taskID)
    ?.constraints.fps;
  return (
    <select
      value={selectedFps || ""}
      onChange={(e) => onChange(Number(e.target.value))}
      className="border border-gray-900 rounded-md p-2 bg-gray-100"
      disabled={!fpsListFromTask}
    >
      {fpsListFromTask!.map((fps: number) => (
        <option key={fps} value={fps}>
          {fps}
        </option>
      ))}
    </select>
  );
}
