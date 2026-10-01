// @ts-nocheck
self.onrtctransform = (event: any) => {
  const transformer = event.transformer;
  transformer.readable.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      postMessage({ type: 'frame', timestamp: chunk.timestamp, now: performance.now() });
      controller.enqueue(chunk);
    }
  })).pipeTo(transformer.writable);
};
