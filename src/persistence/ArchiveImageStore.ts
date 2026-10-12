import type { ArchiveImage, ImageFormat } from '../systems/Archive';

/** The image itself, or the small one shown in the note. */
export type ImageVariant = 'full' | 'thumb';

/** Which file: images live under their note, so the note's rules guard them online. */
export interface ImageRef {
  noteId: string;
  image: Pick<ArchiveImage, 'id' | 'format'>;
}

export interface ImageFiles {
  full: Blob;
  thumb: Blob;
}

/**
 * Where the files of the archive images live, apart from their metadata (the
 * note's `images`): IndexedDB offline, a private Supabase Storage bucket online.
 */
export interface ArchiveImageStore {
  put(ref: ImageRef, files: ImageFiles): Promise<void>;
  /** A URL an image element can show. Online it expires: ask again rather than keeping it. */
  url(ref: ImageRef, variant: ImageVariant): Promise<string>;
  /** The stored file, for an exported save; null when it is missing. */
  read(ref: ImageRef, variant: ImageVariant): Promise<Blob | null>;
  /** Files already gone are not an error. */
  remove(refs: readonly ImageRef[]): Promise<void>;
}

/** `note/image.webp` and `note/image.thumb.webp`; online the game id goes in front. */
export function imagePath({ noteId, image }: ImageRef, variant: ImageVariant): string {
  return `${noteId}/${image.id}${variant === 'thumb' ? '.thumb' : ''}.${image.format}`;
}

export function imageMime(format: ImageFormat): 'image/webp' | 'image/jpeg' {
  return format === 'webp' ? 'image/webp' : 'image/jpeg';
}

export const IMAGE_VARIANTS: readonly ImageVariant[] = ['full', 'thumb'];
