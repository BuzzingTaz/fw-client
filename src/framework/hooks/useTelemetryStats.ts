import { useState, useEffect } from "react";
import { telemetryStore } from "../telemetry/TelemetryStore";

export interface TelemetryStats {
  sendFps: number;
  receiveFps: number;
  avgLatency: number;
}

export function useTelemetryStats(pollingIntervalMs: number = 1000) {
  const [stats, setStats] = useState<TelemetryStats>({
    sendFps: 0,
    receiveFps: 0,
    avgLatency: 0,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const data = telemetryStore.getData();
      const now = performance.now();
      const timeWindow = 2000; // Look at the last 2 seconds for rolling window

      let sendCount = 0;
      let receiveCount = 0;
      let totalLatency = 0;
      let latencyCount = 0;

      for (let i = data.length - 1; i >= 0; i--) {
        const row = data[i];

        // Stop if we're past the time window (using capture time as reference)
        // If capture doesn't exist, we just check the nearest available timestamp
        const refTime = row.events["capture"] || row.events["offload"] || row.events["receive"];
        if (refTime && now - refTime > timeWindow) {
          break;
        }

        if (row.events["offload"] && now - row.events["offload"] <= 1000) {
          sendCount++;
        }

        if (row.events["receive"] && now - row.events["receive"] <= 1000) {
          receiveCount++;
        }

        if (row.events["offload"] && row.events["receive"]) {
          if (now - row.events["receive"] <= timeWindow) {
            totalLatency += (row.events["receive"] - row.events["offload"]);
            latencyCount++;
          }
        }
      }

      setStats({
        sendFps: sendCount, // frames in the last 1000ms
        receiveFps: receiveCount, // frames in the last 1000ms
        avgLatency: latencyCount > 0 ? totalLatency / latencyCount : 0,
      });
    }, pollingIntervalMs);

    return () => clearInterval(interval);
  }, [pollingIntervalMs]);

  return stats;
}
