"use client";
import { useEffect } from "react";
import { OffloadTransport } from "../transports/types";

declare var MediaStreamTrackProcessor: any;
declare var MediaStreamTrackGenerator: any;
declare var VideoFrame: any;

export type OffloadDecisionAlgorithm = (
  frame: VideoFrame,
  frameCount: number,
) => boolean;

/**
 * A hook that sits between a raw MediaStream and an OffloadTransport,
 * applying a decision algorithm to each frame and delegating the send action.
 */
export function useOffloadScheduler(
  offloadStream: MediaStream | null,
  transport: OffloadTransport,
  algorithm: OffloadDecisionAlgorithm,
) {
  useEffect(() => {
    if (!offloadStream || transport.connectionState !== 'connected') return;

    if (typeof MediaStreamTrackProcessor === 'undefined' || typeof MediaStreamTrackGenerator === 'undefined') {
      console.error("MediaStreamTrackProcessor/Generator API is not supported in this browser.");
      return;
    }

    const track = offloadStream.getVideoTracks()[0];
    if (!track) return;

    const processor = new MediaStreamTrackProcessor({ track });
    const generator = new MediaStreamTrackGenerator({ kind: 'video' });
    let frameCount = 0;

    const transformer = new TransformStream({
      transform(frame: VideoFrame, controller) {
        frameCount++;

        // Run the decision algorithm
        if (algorithm(frame, frameCount)) {
          // Track telemetry time for offloaded frames
          transport.trackCaptureTime(performance.now());
          controller.enqueue(frame);
          console.log("offloaded frame", frameCount);
        } else {
          // Drop skipped frames to avoid memory leaks and save CPU
          frame.close();
        }
      }
    });

    processor.readable.pipeThrough(transformer).pipeTo(generator.writable);

    // Hand the generated stream containing only offloaded frames to the transport
    const processedStream = new MediaStream([generator]);
    transport.setSourceStream(processedStream);

    return () => {
      generator.stop();
    };
  }, [offloadStream, transport, algorithm]);
}
