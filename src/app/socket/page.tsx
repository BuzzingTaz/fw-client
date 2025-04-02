"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";

// Connect to existing socketio at ws://localhost:8080
const socket = io("http://localhost:8080");

export default function Page() {
  const [socketData, setSocketData] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [transport, setTransport] = useState("N/A");

  useEffect(() => {
    if (socket.connected) {
      onConnect();
    }

    function onConnect() {
      setIsConnected(true);
      setTransport(socket.io.engine.transport.name);

      socket.io.engine.on("upgrade", (transport) => {
        setTransport(transport.name);
      });
    }

    function onDisconnect() {
      setIsConnected(false);
      setTransport("N/A");
    }

    function onHello(data: string) {
      setSocketData(data);
      console.log(data);
    }

    socket.emit("hello", "world");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("hello", onHello);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("hello", onHello);
    };
  }, []);

  return (
    <div>
      <h1>Socket Page</h1>
      <p>Socket Data: {socketData}</p>
      <p>Connected: {isConnected.toString()}</p>
      <p>Transport: {transport}</p>
    </div>
  );
}
