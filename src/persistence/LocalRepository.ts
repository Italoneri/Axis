import { z } from 'zod';
import type { Catalog } from '../model/catalog';
import type { GameState } from '../model/schema';
import { loadState, parseSave, persistState, STORAGE_KEY } from '../systems/SaveSystem';
import type { GameRepository, SaveResult } from './GameRepository';

const storedRevisionSchema = z.object({ revision: z.number().int().nonnegative().default(0) });

/** Offline repository: one save per browser, kept in sync across its tabs. */
export class LocalRepository implements GameRepository {
  constructor(
    private readonly storage: Storage,
    private readonly catalog: Catalog,
    /** Source of `storage` events from other tabs; absent in tests. */
    private readonly events?: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  ) {}

  load(): Promise<GameState> {
    return Promise.resolve(loadState(this.storage, this.catalog));
  }

  save(state: GameState, expectedRevision: number): Promise<SaveResult> {
    if (this.storedRevision() !== expectedRevision) {
      return Promise.resolve({ ok: false, reason: 'conflict' });
    }
    persistState(this.storage, state);
    return Promise.resolve({ ok: true });
  }

  subscribe(onRemoteChange: (state: GameState) => void): () => void {
    const events = this.events;
    if (!events) return () => undefined;
    const listener = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || event.newValue === null) return;
      const parsed = parseSave(event.newValue, this.catalog);
      if (parsed.ok) onRemoteChange(parsed.state);
      else console.warn('[save] ignoring invalid save from another tab', parsed.error);
    };
    events.addEventListener('storage', listener);
    return () => events.removeEventListener('storage', listener);
  }

  /** Nothing stored (or unreadable) counts as revision 0, the revision of a fresh game. */
  private storedRevision(): number {
    const text = this.storage.getItem(STORAGE_KEY);
    if (text === null) return 0;
    try {
      const parsed = storedRevisionSchema.safeParse(JSON.parse(text));
      return parsed.success ? parsed.data.revision : 0;
    } catch (error) {
      console.warn('[save] stored game is not JSON; treating it as revision 0', error);
      return 0;
    }
  }
}
