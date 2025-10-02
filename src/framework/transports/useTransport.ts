import { useWebRTCTransport } from "./useWebRTCTransport";
import { useWebSocketTransport } from "./useWebsocketTransport";
import {
  OffloadTransport,
  TransportMethods,
  WebRTCTransport,
  WebSocketTransport,
} from "./types";

function useTransport(transportMethod: "webrtc"): WebRTCTransport;
function useTransport(transportMethod: "websocket"): WebSocketTransport;
function useTransport(transportMethod: "none"): OffloadTransport;

function useTransport(
  transportMethod: TransportMethods,
): WebRTCTransport | WebSocketTransport | OffloadTransport {

  // Need to run both hooks to comply with React rules of hooks (no conditional hooks)
  const webRTCTransport = useWebRTCTransport();
  const webSocketTransport = useWebSocketTransport();

  if (transportMethod === "webrtc") {
    return webRTCTransport;
  } else if (transportMethod === "websocket") {
    return webSocketTransport;
  } else {
    return {
      connect: async () => {
        console.warn("No transport selected.");
      },
      disconnect: () => {
        console.warn("No transport selected.");
      },
      sendFrame: () => {
        console.warn("No transport selected.");
      },
      onDataReceived: () => {
        console.warn("No transport selected.");
      },
      connectionState: "disconnected",
      transportMethod: "none",
    };
  }
}

export default useTransport;
