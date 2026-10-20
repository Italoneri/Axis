import { applyCommand, type CommandError } from '../commands/applyCommand';
import { depotItemsNeeded, stockRefusal } from '../commands/depotItemsNeeded';
import type { Catalog } from '../model/catalog';
import type { GameState } from '../model/schema';
import { applyStock, EMPTY_DEPOT, type Depot } from '../systems/Depot';
import { depotSnapshot } from '../systems/Stock';
import { loadState, parseSave, persistState, STORAGE_KEY } from '../systems/SaveSystem';
import type { GameChange, GameRepository, SubmitResult } from './GameRepository';

/** The offline depot as the game sees it: read before a command, written with it. */
export interface StockLedger {
  read(): Depot;
  write(depot: Depot): void;
}

/** Offline repository: one save per browser, kept in sync across its tabs. */
export class LocalRepository implements GameRepository {
  constructor(
    private readonly storage: Storage,
    private readonly catalog: Catalog,
    /** Source of `storage` events from other tabs; absent in tests. */
    private readonly events?: Pick<Window, 'addEventListener' | 'removeEventListener'>,
    /** The local depot; absent, depot items read as missing. */
    private readonly depot?: StockLedger,
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
    if (change.kind === 'restore') {
      const state = { ...change.state, revision: stored.revision + 1 };
      persistState(this.storage, state);
      return Promise.resolve({ ok: true, state });
    }
    return Promise.resolve(this.applyCommand(stored, change));
  }

  /**
   * Same order as the server: the rules read the depot as stored now, then the
   * moves are checked; only when both pass are the depot and the game written.
   */
  private applyCommand(stored: GameState, change: Extract<GameChange, { kind: 'command' }>) {
    const before = this.depot?.read() ?? EMPTY_DEPOT;
    const depot = depotSnapshot(before, depotItemsNeeded(stored, change.command));
    const outcome = applyCommand(stored, this.catalog, change.command, { ...change.ctx, depot });
    if (!outcome.ok) return refused(outcome.error);
    if (outcome.stock.length > 0) {
      const moved = applyStock(before, outcome.stock, new Date().toISOString());
      if (!moved.ok) return refused(stockRefusal(moved.error, change.command));
      this.depot?.write(moved.depot);
    }
    persistState(this.storage, outcome.state);
    const result: SubmitResult = { ok: true, state: outcome.state };
    return result;
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

function refused(error: CommandError): SubmitResult {
  return { ok: false, reason: 'refused', error };
}
