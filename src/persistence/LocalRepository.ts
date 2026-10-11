import { applyCommand } from '../commands/applyCommand';
import type { Catalog } from '../model/catalog';
import type { GameState } from '../model/schema';
import { loadState, parseSave, persistState, STORAGE_KEY } from '../systems/SaveSystem';
import type { GameChange, GameRepository, SubmitResult } from './GameRepository';

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

  submit(change: GameChange, expectedRevision: number): Promise<SubmitResult> {
    // Nothing stored reads as a fresh game, revision 0.
    const stored = loadState(this.storage, this.catalog);
    if (stored.revision !== expectedRevision) {
      return Promise.resolve({ ok: false, reason: 'conflict' });
    }
    const result = this.apply(stored, change);
    if (result.ok) persistState(this.storage, result.state);
    return Promise.resolve(result);
  }

  private apply(stored: GameState, change: GameChange): SubmitResult {
    if (change.kind === 'restore') {
      return { ok: true, state: { ...change.state, revision: stored.revision + 1 } };
    }
    const outcome = applyCommand(stored, this.catalog, change.command, change.ctx);
    if (!outcome.ok) return { ok: false, reason: 'refused', error: outcome.error };
    return { ok: true, state: outcome.state };
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
}
