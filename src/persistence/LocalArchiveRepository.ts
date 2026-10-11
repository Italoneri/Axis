import {
  applyArchiveCommand,
  EMPTY_ARCHIVE,
  parseArchive,
  type Archive,
  type ArchiveCommand,
  type ArchiveContext,
  type ArchiveParse,
} from '../systems/Archive';
import type { ArchiveRepository, ArchiveSubmitResult } from './ArchiveRepository';

export const ARCHIVE_STORAGE_KEY = 'axis-base-builder:archive';

/**
 * Offline archive: one per browser, beside the save. The master's notes are
 * stored here too and only hidden by the window (same browser, as the master
 * password already is).
 */
export class LocalArchiveRepository implements ArchiveRepository {
  constructor(
    private readonly storage: Storage,
    /** Source of `storage` events from other tabs; absent in tests. */
    private readonly events?: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  ) {}

  load(): Promise<Archive> {
    return Promise.resolve(this.read());
  }

  submit(command: ArchiveCommand, ctx: ArchiveContext): Promise<ArchiveSubmitResult> {
    const stored = this.read();
    const outcome = applyArchiveCommand(stored, command, ctx);
    if (outcome.ok && outcome.archive !== stored) this.write(outcome.archive);
    return Promise.resolve(outcome);
  }

  replace(archive: Archive): Promise<void> {
    this.write(archive);
    return Promise.resolve();
  }

  subscribe(onRemoteChange: (archive: Archive) => void): () => void {
    const events = this.events;
    if (!events) return () => undefined;
    const listener = (event: StorageEvent) => {
      if (event.key !== ARCHIVE_STORAGE_KEY) return;
      onRemoteChange(this.read());
    };
    events.addEventListener('storage', listener);
    return () => events.removeEventListener('storage', listener);
  }

  private read(): Archive {
    const text = this.storage.getItem(ARCHIVE_STORAGE_KEY);
    if (text === null) return EMPTY_ARCHIVE;
    const parsed = parseStoredText(text);
    if (parsed.ok) return parsed.archive;
    // Kept aside for recovery by hand instead of being overwritten by the next write.
    console.error('[archive] stored archive is invalid, starting empty', parsed.error);
    this.storage.setItem(`${ARCHIVE_STORAGE_KEY}:corrupted`, text);
    this.storage.removeItem(ARCHIVE_STORAGE_KEY);
    return EMPTY_ARCHIVE;
  }

  private write(archive: Archive): void {
    this.storage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(archive));
  }
}

function parseStoredText(text: string): ArchiveParse {
  try {
    return parseArchive(JSON.parse(text));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
