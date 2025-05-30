"use client";
import { useSocket } from "@/app/lib/hooks/useSocket";

// Socket test page
// TODO: Remove after finalizing socket
export default function Page() {
  const { isConnected, transport } = useSocket();

  return (
    <div>
      <h1>Socket Page</h1>
      <p>Connected: {isConnected.toString()}</p>
      <p>Transport: {transport}</p>
    </div>
  );
}
