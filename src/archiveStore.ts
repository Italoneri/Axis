import type { Actor } from './commands/schema';
import type { ArchiveChange } from './model/schema';
import type {
  ArchiveImageStore,
  ImageFiles,
  ImageRef,
  ImageVariant,
} from './persistence/ArchiveImageStore';
import type { ArchiveRepository } from './persistence/ArchiveRepository';
import {
  droppedImages,
  EMPTY_ARCHIVE,
  visibleArchive,
  type Archive,
  type ArchiveCommand,
  type ArchiveError,
  type ArchiveImage,
} from './systems/Archive';

export interface ArchiveHooks {
  /** Who is acting and looking: the master, or the player's character. */
  viewer: () => Actor;
  /** A change everyone may know about was saved: it becomes an entry of the game log. */
  onLogged: (change: ArchiveChange) => void;
  onRefused: (error: ArchiveError) => void;
  onPersistError: (error: unknown) => void;
  now?: () => string;
}

/**
 * Shell around the archive repository. Unlike the game store it waits for the
 * save before showing a change: records are edited a few at a time, and a
 * refused note should not flash on screen first.
 */
export class ArchiveStore {
  private archive: Archive;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();

  /** A failed first load is reported, not fatal: the game stays playable and the window reloads. */
  static async open(
    repository: ArchiveRepository,
    images: ArchiveImageStore,
    hooks: ArchiveHooks,
  ): Promise<ArchiveStore> {
    try {
      return new ArchiveStore(repository, images, hooks, await repository.load());
    } catch (error) {
      hooks.onPersistError(error);
      return new ArchiveStore(repository, images, hooks, EMPTY_ARCHIVE);
    }
  }

  private constructor(
    private readonly repository: ArchiveRepository,
    private readonly images: ArchiveImageStore,
    private readonly hooks: ArchiveHooks,
    initial: Archive,
  ) {
    this.archive = initial;
    repository.subscribe((remote) => this.show(remote));
  }

  /** What the current viewer may see. */
  get current(): Archive {
    return visibleArchive(this.archive, this.hooks.viewer());
  }

  /**
   * Everything this device holds, for the exported save: offline that includes
   * the master's notes (the file must not lose them); online, only what RLS sent.
   */
  get stored(): Archive {
    return this.archive;
  }

  get viewer(): Actor {
    return this.hooks.viewer();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Resolves to whether the command was saved (refusals are already reported). */
  dispatch(command: ArchiveCommand): Promise<boolean> {
    return this.enqueue(() => this.submit(command));
  }

  /** Re-reads the stored archive (when the window opens, to catch up with missed changes). */
  reload(): Promise<void> {
    return this.enqueue(async () => {
      try {
        this.show(await this.repository.load());
      } catch (error) {
        this.hooks.onPersistError(error);
      }
    });
  }

  /**
   * Stores the files of an image the editor is attaching, before the note is
   * saved. Resolves to whether it worked (failures are already reported).
   */
  async uploadImage(noteId: string, image: ArchiveImage, files: ImageFiles): Promise<boolean> {
    try {
      await this.images.put({ noteId, image }, files);
      return true;
    } catch (error) {
      this.hooks.onPersistError(error);
      return false;
    }
  }

  /** Files uploaded by an editor that was then cancelled, so they never reached a note. */
  discardImages(noteId: string, images: readonly ArchiveImage[]): Promise<void> {
    return this.removeFiles(images.map((image) => ({ noteId, image })));
  }

  imageUrl(noteId: string, image: ArchiveImage, variant: ImageVariant): Promise<string> {
    return this.images.url({ noteId, image }, variant);
  }

  readImage(noteId: string, image: ArchiveImage, variant: ImageVariant): Promise<Blob | null> {
    return this.images.read({ noteId, image }, variant);
  }

  /** An imported save brings its archive along. */
  replace(archive: Archive): Promise<boolean> {
    return this.enqueue(async () => {
      try {
        await this.repository.replace(archive);
        this.show(await this.repository.load());
        return true;
      } catch (error) {
        this.hooks.onPersistError(error);
        return false;
      }
    });
  }

  private async submit(command: ArchiveCommand): Promise<boolean> {
    const now = this.hooks.now?.() ?? new Date().toISOString();
    try {
      const result = await this.repository.submit(command, { viewer: this.viewer, now });
      if (!result.ok) {
        this.hooks.onRefused(result.error);
        return false;
      }
      const before = this.archive;
      this.show(result.archive);
      if (result.change) this.hooks.onLogged(result.change);
      // Images removed from a note, or whose note left the trash for good, lose their files.
      await this.removeFiles(droppedImages(before, result.archive));
      return true;
    } catch (error) {
      this.hooks.onPersistError(error);
      return false;
    }
  }

  /** A file left behind only costs space, so a failure here is logged, not reported. */
  private async removeFiles(refs: readonly ImageRef[]): Promise<void> {
    if (refs.length === 0) return;
    try {
      await this.images.remove(refs);
    } catch (error) {
      console.warn('[archive] could not remove image files', error);
    }
  }

  /** Writes run one at a time, so each one sees the result of the previous. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task);
    // Tasks report their own errors; this only keeps one failure from blocking the queue.
    this.queue = next.catch(() => undefined);
    return next;
  }

  private show(archive: Archive): void {
    if (archive === this.archive) return;
    this.archive = archive;
    this.listeners.forEach((listener) => listener());
  }
}
