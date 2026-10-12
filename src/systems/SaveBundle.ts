import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { imagePath, type ImageRef, type ImageVariant } from '../persistence/ArchiveImageStore';
import type { Archive } from './Archive';

// A save with archive images is a .zip: save.json (the same JSON as a plain
// save) plus the image files under images/. Saves without images stay .json.

export const SAVE_ENTRY = 'save.json';
const IMAGES_DIR = 'images/';

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
    Object.entries(entries).filter(([path]) => path.startsWith(IMAGES_DIR) && !path.endsWith('/')),
  );
  return { ok: true, saveText: strFromU8(save), files };
}
