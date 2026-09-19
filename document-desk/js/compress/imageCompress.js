/**
 * Re-encodes an image at a lower quality and/or smaller dimensions.
 * Runs entirely on canvas — no library needed.
 */
export function compressImage(file, { quality = 0.75, scale = 1, format = 'image/jpeg' } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      // JPEG has no alpha channel — paint white behind transparent PNGs first,
      // otherwise transparency renders black.
      if (format === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob) resolve(blob);
          else reject(new Error('Canvas could not encode this image.'));
        },
        format,
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image file.')); };
    img.src = url;
  });
}
