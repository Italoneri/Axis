import {
  checkImageFile,
  fitWithin,
  IMAGE_LIMITS,
  type ImagePrepareError,
} from '../../systems/ArchiveImages';
import type { ImageFormat } from '../../systems/Archive';
import type { ImageFiles } from '../../persistence/ArchiveImageStore';

export interface PreparedImage {
  width: number;
  height: number;
  bytes: number;
  format: ImageFormat;
  files: ImageFiles;
}

export type PrepareResult =
  { ok: true; image: PreparedImage } | { ok: false; error: ImagePrepareError };

/**
 * Checks, shrinks and re-encodes a picked, dropped or pasted file before it is
 * stored: WebP (JPEG where the browser cannot write WebP), longest side up to
 * `IMAGE_LIMITS.maxSide`, plus a thumbnail. A GIF keeps its first frame.
 */
export async function prepareImage(file: File, imagesAlready: number): Promise<PrepareResult> {
  const error = checkImageFile(file, imagesAlready);
  if (error) return { ok: false, error };
  const bitmap = await decodeImage(file);
  if (!bitmap) return { ok: false, error: 'unreadable' };
  try {
    const size = fitWithin(bitmap.width, bitmap.height, IMAGE_LIMITS.maxSide);
    const full = await encodeImage(bitmap, size, 'webp');
    if (full.blob.size > IMAGE_LIMITS.storedBytes) {
      return { ok: false, error: 'compressed_too_large' };
    }
    const thumbSize = fitWithin(bitmap.width, bitmap.height, IMAGE_LIMITS.thumbSide);
    const thumb = await encodeImage(bitmap, thumbSize, full.format);
    return {
      ok: true,
      image: {
        ...size,
        bytes: full.blob.size,
        format: full.format,
        files: { full: full.blob, thumb: thumb.blob },
      },
    };
  } finally {
    bitmap.close();
  }
}

/** Null when the browser cannot read the file as an image. A GIF gives its first frame. */
export async function decodeImage(file: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file);
  } catch (error) {
    console.warn('[images] could not decode image', error);
    return null;
  }
}

/** Part of the bitmap to draw, in its pixels; the whole bitmap when absent. */
export interface SourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Browsers that cannot write WebP hand back a PNG: those get JPEG instead. */
export async function encodeImage(
  bitmap: ImageBitmap,
  size: { width: number; height: number },
  wanted: ImageFormat,
  source?: SourceRect,
): Promise<{ blob: Blob; format: ImageFormat }> {
  if (wanted === 'webp') {
    const webp = await draw(bitmap, size, 'image/webp', source);
    if (webp.type === 'image/webp') return { blob: webp, format: 'webp' };
  }
  return { blob: await draw(bitmap, size, 'image/jpeg', source), format: 'jpeg' };
}

function draw(
  bitmap: ImageBitmap,
  { width, height }: { width: number; height: number },
  type: 'image/webp' | 'image/jpeg',
  source: SourceRect = { x: 0, y: 0, width: bitmap.width, height: bitmap.height },
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('encode image: no 2d canvas'));
  // JPEG has no transparency: a transparent PNG would turn black.
  if (type === 'image/jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode image: no blob'))),
      type,
      IMAGE_LIMITS.quality,
    ),
  );
}
