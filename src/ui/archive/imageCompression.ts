import {
  checkImageFile,
  fitWithin,
  IMAGE_LIMITS,
  type ImageFileError,
} from '../../systems/ArchiveImages';
import type { ImageFormat } from '../../systems/Archive';
import type { ImageFiles } from '../../persistence/ArchiveImageStore';

export type PrepareError = ImageFileError | 'unreadable' | 'compressed_too_large';

export interface PreparedImage {
  width: number;
  height: number;
  bytes: number;
  format: ImageFormat;
  files: ImageFiles;
}

export type PrepareResult = { ok: true; image: PreparedImage } | { ok: false; error: PrepareError };

/**
 * Checks, shrinks and re-encodes a picked, dropped or pasted file before it is
 * stored: WebP (JPEG where the browser cannot write WebP), longest side up to
 * `IMAGE_LIMITS.maxSide`, plus a thumbnail. A GIF keeps its first frame.
 */
export async function prepareImage(file: File, imagesAlready: number): Promise<PrepareResult> {
  const error = checkImageFile(file, imagesAlready);
  if (error) return { ok: false, error };
  const bitmap = await decode(file);
  if (!bitmap) return { ok: false, error: 'unreadable' };
  try {
    const size = fitWithin(bitmap.width, bitmap.height, IMAGE_LIMITS.maxSide);
    const full = await encode(bitmap, size, 'webp');
    if (full.blob.size > IMAGE_LIMITS.storedBytes) {
      return { ok: false, error: 'compressed_too_large' };
    }
    const thumbSize = fitWithin(bitmap.width, bitmap.height, IMAGE_LIMITS.thumbSide);
    const thumb = await encode(bitmap, thumbSize, full.format);
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

async function decode(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file);
  } catch (error) {
    console.warn('[archive] could not decode image', error);
    return null;
  }
}

/** Browsers that cannot write WebP hand back a PNG: those get JPEG instead. */
async function encode(
  bitmap: ImageBitmap,
  size: { width: number; height: number },
  wanted: ImageFormat,
): Promise<{ blob: Blob; format: ImageFormat }> {
  if (wanted === 'webp') {
    const webp = await draw(bitmap, size, 'image/webp');
    if (webp.type === 'image/webp') return { blob: webp, format: 'webp' };
  }
  return { blob: await draw(bitmap, size, 'image/jpeg'), format: 'jpeg' };
}

function draw(
  bitmap: ImageBitmap,
  { width, height }: { width: number; height: number },
  type: 'image/webp' | 'image/jpeg',
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('archive image: no 2d canvas'));
  // JPEG has no transparency: a transparent PNG would turn black.
  if (type === 'image/jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('archive image: encode'))),
      type,
      IMAGE_LIMITS.quality,
    ),
  );
}
