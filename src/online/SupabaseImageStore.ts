import {
  IMAGE_VARIANTS,
  imageMime,
  imagePath,
  type ArchiveImageStore,
  type ImageFiles,
  type ImageRef,
  type ImageVariant,
} from '../persistence/ArchiveImageStore';

export const ARCHIVE_IMAGE_BUCKET = 'archive-images';
/** Signed URLs are short-lived; one is reused until a minute before it expires. */
export const SIGNED_URL_SECONDS = 600;
const RENEW_BEFORE_MS = 60_000;
/** Storage removes at most this many objects per call. */
const REMOVE_BATCH = 100;

/** What the online image store needs from Supabase Storage; `supabaseImageBucket` wires it. */
export interface ImageBucket {
  upload(path: string, blob: Blob, contentType: string): Promise<void>;
  signedUrl(path: string, seconds: number): Promise<string>;
  /** Null when the object does not exist (or the caller may not read it). */
  download(path: string): Promise<Blob | null>;
  remove(paths: readonly string[]): Promise<void>;
}

/**
 * Online image files, in a private bucket at game_id/note_id/image_id: the
 * Storage policies apply the note's rules, so players never get the files of
 * the master's notes, not even a URL.
 */
export class SupabaseImageStore implements ArchiveImageStore {
  private readonly urls = new Map<string, { url: string; expiresAt: number }>();

  constructor(
    private readonly bucket: ImageBucket,
    private readonly gameId: string,
    private readonly now: () => number = Date.now,
  ) {}

  async put(ref: ImageRef, files: ImageFiles): Promise<void> {
    const type = imageMime(ref.image.format);
    await this.bucket.upload(this.path(ref, 'full'), files.full, type);
    await this.bucket.upload(this.path(ref, 'thumb'), files.thumb, type);
  }

  async url(ref: ImageRef, variant: ImageVariant): Promise<string> {
    const path = this.path(ref, variant);
    const cached = this.urls.get(path);
    if (cached && cached.expiresAt - this.now() > RENEW_BEFORE_MS) return cached.url;
    const url = await this.bucket.signedUrl(path, SIGNED_URL_SECONDS);
    this.urls.set(path, { url, expiresAt: this.now() + SIGNED_URL_SECONDS * 1000 });
    return url;
  }

  read(ref: ImageRef, variant: ImageVariant): Promise<Blob | null> {
    return this.bucket.download(this.path(ref, variant));
  }

  async remove(refs: readonly ImageRef[]): Promise<void> {
    const paths = refs.flatMap((ref) => IMAGE_VARIANTS.map((variant) => this.path(ref, variant)));
    for (let start = 0; start < paths.length; start += REMOVE_BATCH) {
      await this.bucket.remove(paths.slice(start, start + REMOVE_BATCH));
    }
    paths.forEach((path) => this.urls.delete(path));
  }

  private path(ref: ImageRef, variant: ImageVariant): string {
    return `${this.gameId}/${imagePath(ref, variant)}`;
  }
}
