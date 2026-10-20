import type { Actor } from './commands/schema';
import type { DepotChange } from './model/schema';
import type { DepotRepository } from './persistence/DepotRepository';
import type { StockMove } from './systems/Stock';
import {
  applyStock,
  EMPTY_DEPOT,
  visibleDepot,
  type Depot,
  type DepotCommand,
  type DepotDelivery,
  type DepotError,
} from './systems/Depot';

export interface DepotHooks {
  /** Who is acting and looking: the master, or the player's character. */
  viewer: () => Actor;
  /** A change of the group's depot was saved: it becomes an entry of the game log. */
  onLogged: (change: DepotChange) => void;
  onRefused: (error: DepotError) => void;
  onPersistError: (error: unknown) => void;
  now?: () => string;
}

/**
 * Shell around the depot repository, like the ArchiveStore: it waits for the
 * save before showing a change, and runs writes one at a time.
 */
export class DepotStore {
  private depot: Depot;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();

  /** A failed first load is reported, not fatal: the game stays playable and the window reloads. */
  static async open(repository: DepotRepository, hooks: DepotHooks): Promise<DepotStore> {
    try {
      return new DepotStore(repository, hooks, await repository.load());
    } catch (error) {
      hooks.onPersistError(error);
      return new DepotStore(repository, hooks, EMPTY_DEPOT);
    }
  }

  private constructor(
    private readonly repository: DepotRepository,
    private readonly hooks: DepotHooks,
    initial: Depot,
  ) {
    this.depot = initial;
    repository.subscribe((remote) => this.show(remote));
  }

  /** What the current viewer may see. */
  get current(): Depot {
    return visibleDepot(this.depot, this.hooks.viewer());
  }

  /**
   * Everything this device holds, for the exported save: offline that includes
   * every private area; online, only what RLS sent.
   */
  get stored(): Depot {
    return this.depot;
  }

  get viewer(): Actor {
    return this.hooks.viewer();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Resolves to whether the command was saved (refusals are already reported). */
  dispatch(command: DepotCommand): Promise<boolean> {
    return this.enqueue(() => this.submit(command));
  }

  /** A shop purchase into the buyer's area (offline); resolves to whether it was saved. */
  deliver(delivery: DepotDelivery): Promise<boolean> {
    return this.enqueue(async () => {
      const now = this.hooks.now?.() ?? new Date().toISOString();
      try {
        const saved = await this.repository.deliver(delivery, now);
        if (saved) this.show(await this.repository.load());
        return saved;
      } catch (error) {
        this.hooks.onPersistError(error);
        return false;
      }
    });
  }

  /**
   * Shows the garden and lab moves of a command still being saved; `reload`
   * once it settles brings back what is really stored. Nothing is written here.
   */
  preview(moves: readonly StockMove[]): void {
    const now = this.hooks.now?.() ?? new Date().toISOString();
    const moved = applyStock(this.depot, moves, now);
    if (moved.ok) this.show(moved.depot);
  }

  /** Re-reads the stored depot (when the window opens, to catch up with missed changes). */
  reload(): Promise<void> {
    return this.enqueue(async () => {
      try {
        this.show(await this.repository.load());
      } catch (error) {
        this.hooks.onPersistError(error);
      }
    });
  }

  /** An imported save brings its depot along. */
  replace(depot: Depot): Promise<boolean> {
    return this.enqueue(async () => {
      try {
        await this.repository.replace(depot);
        this.show(await this.repository.load());
        return true;
      } catch (error) {
        this.hooks.onPersistError(error);
        return false;
      }
    });
  }

  private async submit(command: DepotCommand): Promise<boolean> {
    const now = this.hooks.now?.() ?? new Date().toISOString();
    try {
      const result = await this.repository.submit(command, { viewer: this.viewer, now });
      if (!result.ok) {
        this.hooks.onRefused(result.error);
        return false;
      }
      this.show(result.depot);
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

  private show(depot: Depot): void {
    if (depot === this.depot) return;
    this.depot = depot;
    this.listeners.forEach((listener) => listener());
  }
}
