// Client-side photo compression: resize to 1080 px on the long edge, encode AVIF
// (fallback WebP, then JPEG) and step quality down until the file is ≤ 80 KB.

export const MAX_EDGE = 1080;
export const TARGET_MAX_BYTES = 80 * 1024;
const QUALITIES = [0.7, 0.6, 0.5, 0.42, 0.35, 0.28];
const FORMATS = ['image/avif', 'image/webp', 'image/jpeg'] as const;

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  type: string;
  quality: number;
}

export function fitWithin(w: number, h: number, max = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

let supported: string | null = null;
/** Browsers silently fall back to PNG for unsupported types, so probe once. */
async function bestFormat(): Promise<string> {
  if (supported) return supported;
  const c = document.createElement('canvas');
  c.width = c.height = 2;
  for (const f of FORMATS) {
    const b = await toBlob(c, f, 0.5);
    if (b && b.type === f) return (supported = f);
  }
  return (supported = 'image/jpeg');
}

export async function compressImage(file: Blob): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const type = await bestFormat();
  let best: CompressedImage | null = null;
  for (const q of QUALITIES) {
    const blob = await toBlob(canvas, type, q);
    if (!blob) continue;
    best = { blob, width, height, type: blob.type, quality: q };
    if (blob.size <= TARGET_MAX_BYTES) break;
  }
  if (!best) throw new Error('Could not encode this image');
  return best;
}

/** Load a Blob into an <img> element (used by NSFW and face checks). */
export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = URL.createObjectURL(blob);
  });
}
