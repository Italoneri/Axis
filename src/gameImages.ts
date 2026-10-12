import type { GameState } from './model/schema';
import type { ArchiveImageStore, ImageFiles, ImageVariant } from './persistence/ArchiveImageStore';
import type { ImageFormat } from './systems/Archive';
import {
  droppedUploads,
  fileRef,
  parseUploadRef,
  uploadRef,
  uploadsOf,
  type ImageTarget,
  type UploadRef,
} from './systems/GameImages';
import { newId } from './commands/newId';

/** The photo files an imported save carries (a .zip); undefined for those it lacks. */
export type PhotoFileSource = (ref: UploadRef, variant: ImageVariant) => Blob | undefined;

/**
 * Shell around the files of the photos sent in game. It reuses the archive's
 * file stores (IndexedDB offline, a private bucket online) with the record's
 * folder, `<kind>/<id>`, where the archive puts the note id.
 */
export class GameImages {
  /** The last URL handed out per file, so a redraw shows the photo at once. */
  private readonly known = new Map<string, string>();

  constructor(
    private readonly files: ArchiveImageStore,
    private readonly onError: (error: unknown) => void = (error) =>
      console.error('[photos] could not store a photo', error),
  ) {}

  /** Stores a new photo of `target`; resolves to its reference, or null when it failed (already reported). */
  async upload(
    target: ImageTarget,
    files: ImageFiles,
    format: ImageFormat,
  ): Promise<string | null> {
    const ref: UploadRef = { target, imageId: newId('img'), format };
    try {
      await this.files.put(fileRef(ref), files);
      return uploadRef(ref);
    } catch (error) {
      this.onError(error);
      return null;
    }
  }

  /** A URL an image element can show. Online it expires: ask again rather than keeping it. */
  async url(ref: string, variant: ImageVariant): Promise<string> {
    const upload = parseUploadRef(ref);
    if (!upload) throw new Error(`not an uploaded photo: ${ref}`);
    const url = await this.files.url(fileRef(upload), variant);
    this.known.set(knownKey(ref, variant), url);
    return url;
  }

  /** The URL handed out last time, if any; it may have expired since. */
  peek(ref: string, variant: ImageVariant): string | undefined {
    return this.known.get(knownKey(ref, variant));
  }

  /** The stored file, for an exported save; null when it is missing. */
  read(ref: UploadRef, variant: ImageVariant): Promise<Blob | null> {
    return this.files.read(fileRef(ref), variant);
  }

  /**
   * Photos the game stopped referring to (replaced, cleared, record removed).
   * A file left behind only costs space, so a failure is logged, not reported.
   */
  async removeDropped(before: GameState, after: GameState): Promise<void> {
    await this.remove(droppedUploads(before, after));
  }

  /** A photo uploaded for a form that was then refused, so it never reached the game. */
  async discard(ref: string): Promise<void> {
    const upload = parseUploadRef(ref);
    if (upload) await this.remove([upload]);
  }

  /** Puts back the photos of an imported save; a file missing from it leaves the initial instead. */
  async restore(state: GameState, source: PhotoFileSource): Promise<void> {
    for (const ref of uploadsOf(state)) {
      const full = source(ref, 'full');
      const thumb = source(ref, 'thumb');
      if (full && thumb) await this.files.put(fileRef(ref), { full, thumb });
    }
  }

  private async remove(refs: readonly UploadRef[]): Promise<void> {
    if (refs.length === 0) return;
    refs.forEach((ref) => {
      this.known.delete(knownKey(uploadRef(ref), 'full'));
      this.known.delete(knownKey(uploadRef(ref), 'thumb'));
    });
    try {
      await this.files.remove(refs.map(fileRef));
    } catch (error) {
      console.warn('[photos] could not remove photo files', error);
    }
  }
}

function knownKey(ref: string, variant: ImageVariant): string {
  return `${variant} ${ref}`;
}
