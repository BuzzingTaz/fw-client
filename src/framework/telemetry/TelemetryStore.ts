export type TelemetryRow = {
  id: number;
  events: Record<string, number>;
  metadata: Record<string, any>;
};

class TelemetryEngine {
  private data: Record<number, TelemetryRow> = {};
  private eventTypes: Set<string> = new Set();

  logEvent(frameId: number, eventType: string, timestamp: number, metadata?: Record<string, any>) {
    if (!this.data[frameId]) {
      this.data[frameId] = { id: frameId, events: {}, metadata: {} };
    }

    this.data[frameId].events[eventType] = timestamp;
    this.eventTypes.add(eventType);

    if (metadata) {
      this.data[frameId].metadata = { ...this.data[frameId].metadata, ...metadata };
    }
  }

  getData(): TelemetryRow[] {
    return Object.values(this.data);
  }

  getEventTypes(): string[] {
    return Array.from(this.eventTypes);
  }

  clear() {
    this.data = {};
    this.eventTypes.clear();
  }
}

// Export a singleton instance that can be used globally across any component or hook
export const telemetryStore = new TelemetryEngine();
