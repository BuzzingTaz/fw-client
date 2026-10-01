export interface OffloadTransport {
  /**
   * Initiates a connection to the edge server.
   * @param config - Configuration object, e.g., signaling server URL.
   */
  connect: (config: { serverUrl: string }) => Promise<void>;

  /**
   * Terminates the connection.
   */
  disconnect: () => void;

  /**
   * Sets the source MediaStream for the transport.
   * This stream is directly piped to the transport layer.
   * @param stream - The processed MediaStream containing the filtered tracks.
   */
  setSourceStream: (stream: MediaStream) => void;

  /**
   * Records the capture time for an offloaded frame to correlate telemetry.
   * @param time - The performance.now() timestamp when the frame was captured.
   */
  trackCaptureTime: (time: number) => void;

  /**
   * A way to register a callback function that will be invoked
   * whenever processed data is received from the edge.
   * @param callback - The function to call with the incoming data.
   */
  onDataReceived: (callback: (data: any) => void) => void;

  /**
   * The current state of the connection, for UI feedback.
   */
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'failed';

  /** Indicate the transport method used
   */
  transportMethod: TransportMethods;
}

export interface WebRTCTransport {
  pc: RTCPeerConnection | null;
  offloadTransport: OffloadTransport;
}

export interface WebSocketTransport {
  socket: WebSocket | null;
  offloadTransport: OffloadTransport;
}

export type TransportMethods = 'webrtc' | 'websocket' | 'none';
