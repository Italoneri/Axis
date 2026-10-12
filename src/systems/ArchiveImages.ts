// Limits and pure checks for images attached to archive notes (see
// docs/plans/ARQUIVO.md, "Imagens anexadas às notas"). The browser work
// (decoding, canvas, upload) lives in src/ui/archive/imageCompression.ts.

export const IMAGE_LIMITS = {
  /** Original file picked, dropped or pasted. */
  originalBytes: 10 * 1024 * 1024,
  /** What is stored after compression (the bucket enforces it too). */
  storedBytes: 2 * 1024 * 1024,
  perNote: 12,
  /** Longest side of the stored image. */
  maxSide: 2000,
  thumbSide: 320,
  quality: 0.85,
  captionLength: 300,
} as const;

/** GIFs are accepted and stored as a still image (their first frame). */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export type ImageFileError = 'unsupported_format' | 'file_too_large' | 'too_many_images';

/** A file the user offered, before anything is decoded. */
export function checkImageFile(
  file: { type: string; size: number },
  imagesAlready: number,
): ImageFileError | null {
  if (!ACCEPTED_IMAGE_TYPES.some((type) => type === file.type)) return 'unsupported_format';
  if (file.size > IMAGE_LIMITS.originalBytes) return 'file_too_large';
  if (imagesAlready >= IMAGE_LIMITS.perNote) return 'too_many_images';
  return null;
}

/** Shrinks to fit `maxSide` on the longest side, keeping the ratio; never enlarges. */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
