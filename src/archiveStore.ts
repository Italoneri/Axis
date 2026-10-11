import type { Actor } from './commands/schema';
import type { ArchiveChange } from './model/schema';
import type { ArchiveRepository } from './persistence/ArchiveRepository';
import {
  EMPTY_ARCHIVE,
  visibleArchive,
  type Archive,
  type ArchiveCommand,
  type ArchiveError,
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
  static async open(repository: ArchiveRepository, hooks: ArchiveHooks): Promise<ArchiveStore> {
    try {
      return new ArchiveStore(repository, hooks, await repository.load());
    } catch (error) {
      hooks.onPersistError(error);
      return new ArchiveStore(repository, hooks, EMPTY_ARCHIVE);
    }
  }

  private constructor(
    private readonly repository: ArchiveRepository,
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
      this.show(result.archive);
      if (result.change) this.hooks.onLogged(result.change);
      return true;
    } catch (error) {
      this.hooks.onPersistError(error);
      return false;
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
