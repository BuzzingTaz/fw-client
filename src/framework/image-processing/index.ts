export const resize = (imageData: ImageData, width: number, height: number): ImageData => {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Could not get 2d context');
    }

    ctx.putImageData(imageData, 0, 0);
    return ctx.getImageData(0, 0, width, height);
};
