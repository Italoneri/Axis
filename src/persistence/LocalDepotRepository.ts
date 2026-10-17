import {
  applyDepotCommand,
  deliverToDepot,
  EMPTY_DEPOT,
  parseDepot,
  type Depot,
  type DepotCommand,
  type DepotContext,
  type DepotDelivery,
  type DepotParse,
} from '../systems/Depot';
import type { DepotRepository, DepotSubmitResult } from './DepotRepository';

export const DEPOT_STORAGE_KEY = 'axis-base-builder:depot';

/**
 * Offline depot: one per browser, beside the save. Private areas are stored
 * here too and only hidden by the window (same browser for everyone, as the
 * archive's master notes are).
 */
export class LocalDepotRepository implements DepotRepository {
  constructor(
    private readonly storage: Storage,
    /** Source of `storage` events from other tabs; absent in tests. */
    private readonly events?: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  ) {}

  load(): Promise<Depot> {
    return Promise.resolve(this.read());
  }

  submit(command: DepotCommand, ctx: DepotContext): Promise<DepotSubmitResult> {
    const stored = this.read();
    const outcome = applyDepotCommand(stored, command, ctx);
    if (outcome.ok && outcome.depot !== stored) this.write(outcome.depot);
    return Promise.resolve(outcome);
  }

  deliver(delivery: DepotDelivery, now: string): Promise<boolean> {
    this.write(deliverToDepot(this.read(), delivery, now));
    return Promise.resolve(true);
  }

  replace(depot: Depot): Promise<void> {
    this.write(depot);
    return Promise.resolve();
  }

  subscribe(onRemoteChange: (depot: Depot) => void): () => void {
    const events = this.events;
    if (!events) return () => undefined;
    const listener = (event: StorageEvent) => {
      if (event.key !== DEPOT_STORAGE_KEY) return;
      onRemoteChange(this.read());
    };
    events.addEventListener('storage', listener);
    return () => events.removeEventListener('storage', listener);
  }

  private read(): Depot {
    const text = this.storage.getItem(DEPOT_STORAGE_KEY);
    if (text === null) return EMPTY_DEPOT;
    const parsed = parseStoredText(text);
    if (parsed.ok) return parsed.depot;
    // Kept aside for recovery by hand instead of being overwritten by the next write.
    console.error('[depot] stored depot is invalid, starting empty', parsed.error);
    this.storage.setItem(`${DEPOT_STORAGE_KEY}:corrupted`, text);
    this.storage.removeItem(DEPOT_STORAGE_KEY);
    return EMPTY_DEPOT;
  }

  private write(depot: Depot): void {
    this.storage.setItem(DEPOT_STORAGE_KEY, JSON.stringify(depot));
  }
}

function parseStoredText(text: string): DepotParse {
  try {
    return parseDepot(JSON.parse(text));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
