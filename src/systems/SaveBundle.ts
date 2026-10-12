import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { imagePath, type ImageRef, type ImageVariant } from '../persistence/ArchiveImageStore';
import type { GameState } from '../model/schema';
import type { Archive } from './Archive';
import { fileRef, uploadsOf, type UploadRef } from './GameImages';

// A save with images is a .zip: save.json (the same JSON as a plain save),
// the archive images under images/ and the photos sent in game under
// game-images/. Saves without any stay .json.

export const SAVE_ENTRY = 'save.json';
const IMAGES_DIR = 'images/';
const PHOTOS_DIR = 'game-images/';
const BUNDLE_DIRS = [IMAGES_DIR, PHOTOS_DIR];

export function bundleImagePath(ref: ImageRef, variant: ImageVariant): string {
  return `${IMAGES_DIR}${imagePath(ref, variant)}`;
}

/** Every image file the archive refers to, both variants. */
export function archiveImageFiles(archive: Archive): { ref: ImageRef; variant: ImageVariant }[] {
  return archive.notes.flatMap((note) =>
    note.images.flatMap((image) =>
      (['full', 'thumb'] as const).map((variant) => ({
        ref: { noteId: note.id, image },
        variant,
      })),
    ),
  );
}

export function hasArchiveImages(archive: Archive): boolean {
  return archive.notes.some((note) => note.images.length > 0);
}

/** `game-images/<kind>/<id>/<image>.webp`, and `.thumb.webp`. */
export function bundlePhotoPath(ref: UploadRef, variant: ImageVariant): string {
  return `${PHOTOS_DIR}${imagePath(fileRef(ref), variant)}`;
}

/** Every photo file the game refers to, both variants. */
export function photoFiles(state: GameState): { ref: UploadRef; variant: ImageVariant }[] {
  return uploadsOf(state).flatMap((ref) =>
    (['full', 'thumb'] as const).map((variant) => ({ ref, variant })),
  );
}

/** The images are already compressed, so the zip only stores them. */
export function bundleSave(
  saveText: string,
  files: ReadonlyMap<string, Uint8Array>,
): Uint8Array<ArrayBuffer> {
  const entries: Zippable = { [SAVE_ENTRY]: [strToU8(saveText), { level: 6 }] };
  files.forEach((bytes, path) => {
    entries[path] = [bytes, { level: 0 }];
  });
  // A copy with its own ArrayBuffer, which Blob accepts.
  return new Uint8Array(zipSync(entries));
}

export type BundleRead =
  | { ok: true; saveText: string; files: ReadonlyMap<string, Uint8Array> }
  | { ok: false; error: string };

/** A zip starts with "PK\x03\x04"; anything else is read as a plain JSON save. */
export function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function readBundle(bytes: Uint8Array): BundleRead {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (error) {
    return { ok: false, error: `zip: ${error instanceof Error ? error.message : String(error)}` };
  }
  const save = entries[SAVE_ENTRY];
  if (!save) return { ok: false, error: `zip: ${SAVE_ENTRY} is missing` };
  const files = new Map(
    Object.entries(entries).filter(
      ([path]) => BUNDLE_DIRS.some((dir) => path.startsWith(dir)) && !path.endsWith('/'),
    ),
  );
  return { ok: true, saveText: strFromU8(save), files };
}
