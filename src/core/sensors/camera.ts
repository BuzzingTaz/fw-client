export const startCamera = async (
  cameraWidth: number,
  cameraHeight: number,
  cameraFps: number,
) => {
  console.log("startCamera");
  const mediaStreamConstraints = {
    video: {
      width: { ideal: cameraWidth },
      height: { ideal: cameraHeight },
      frameRate: { ideal: cameraFps },
    },
  };

  console.log(mediaStreamConstraints);
  const mediaStream = await navigator.mediaDevices.getUserMedia(
    mediaStreamConstraints,
  );
  return mediaStream;
};
