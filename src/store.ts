import { applyCommand, type CommandError, type StateChange } from './commands/applyCommand';
import type { CommandContext, GameCommand } from './commands/schema';
import type { Catalog } from './model/catalog';
import type { GameState, LogEntry } from './model/schema';
import type { GameChange, GameRepository } from './persistence/GameRepository';

export type { StateChange } from './commands/applyCommand';

/** `logged`: entries a local command just added (empty for loads and remote changes). */
type Listener = (state: GameState, change: StateChange, logged: readonly LogEntry[]) => void;

export interface StoreHooks {
  /** Who is acting for this command; the store never decides permissions itself. */
  contextFor: (command: GameCommand) => CommandContext;
  onRefused: (error: CommandError) => void;
  onPersistError: (error: unknown) => void;
}

/** A local change not yet accepted by the repository. */
type Pending = GameChange;

/** After this many conflicts in a row, local changes are dropped in favor of the stored game. */
const MAX_CONFLICTS = 3;

/**
 * Imperative shell around `applyCommand`. Changes show up immediately
 * (optimistic) and are then saved in order; when the repository reports that
 * someone else saved first, the store reloads and replays its pending
 * commands on top, so the rules always run against the latest game.
 */
export class GameStore {
  /** Last state the repository accepted. */
  private confirmed: GameState;
  /** `confirmed` plus the pending changes: what the player sees. */
  private state: GameState;
  private pending: Pending[] = [];
  private syncing: Promise<void> = Promise.resolve();
  /** A submit is in flight: remote updates wait for it (they may be its own echo). */
  private isSubmitting = false;
  /** A remote update arrived while submitting; refresh the view once the queue settles. */
  private hasDeferredRemote = false;
  private readonly listeners = new Set<Listener>();

  static async open(
    catalog: Catalog,
    repository: GameRepository,
    hooks: StoreHooks,
  ): Promise<GameStore> {
    return new GameStore(catalog, repository, hooks, await repository.load());
  }

  private constructor(
    readonly catalog: Catalog,
    private readonly repository: GameRepository,
    private readonly hooks: StoreHooks,
    initial: GameState,
  ) {
    this.confirmed = initial;
    this.state = initial;
    repository.subscribe((remote) => this.receiveRemote(remote));
  }

  get current(): GameState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Runs one command; returns the refusal (already reported through `onRefused`), if any. */
  dispatch(command: GameCommand): CommandError | null {
    const ctx = this.hooks.contextFor(command);
    const outcome = applyCommand(this.state, this.catalog, command, ctx);
    if (!outcome.ok) {
      this.hooks.onRefused(outcome.error);
      return outcome.error;
    }
    if (outcome.state === this.state) return null;
    this.enqueue({ kind: 'command', command, ctx }, outcome.state, outcome.change, outcome.logged);
    return null;
  }

  /** Restores an imported save (already validated by `parseSave`), overwriting the stored game. */
  replace(state: GameState): void {
    const restored = { ...state, revision: this.state.revision + 1 };
    this.enqueue({ kind: 'restore', state }, restored, { kind: 'loaded' });
  }

  /** Resolves once every change so far was saved (or given up on). */
  whenSynced(): Promise<void> {
    return this.syncing;
  }

  private enqueue(
    change: Pending,
    next: GameState,
    stateChange: StateChange,
    logged: readonly LogEntry[] = [],
  ): void {
    this.pending.push(change);
    this.show(next, stateChange, logged);
    this.syncing = this.syncing.then(() => this.sync());
  }

  /** Sends pending changes one by one, in order, as the repository accepts them. */
  private async sync(): Promise<void> {
    let conflicts = 0;
    let isStale = false;
    this.isSubmitting = true;
    while (this.pending.length > 0) {
      const [change] = this.pending;
      if (!change) break;
      let result;
      try {
        result = await this.repository.submit(change, this.confirmed.revision);
      } catch (error) {
        // Kept pending: the next change retries them, and the game stays playable meanwhile.
        this.hooks.onPersistError(error);
        break;
      }
      if (result.ok) {
        conflicts = 0;
        // Realtime may already have brought this revision (or a newer one).
        if (result.state.revision > this.confirmed.revision) this.confirmed = result.state;
        this.pending = this.pending.slice(1);
      } else if (result.reason === 'refused') {
        this.pending = this.pending.slice(1);
        this.hooks.onRefused(result.error);
        isStale = true;
      } else if (++conflicts >= MAX_CONFLICTS) {
        console.warn('[save] giving up after repeated conflicts', { dropped: this.pending.length });
        this.confirmed = await this.repository.load();
        this.pending = [];
        this.hooks.onRefused('conflict');
        isStale = true;
      } else {
        this.confirmed = await this.repository.load();
        isStale = true;
      }
    }
    // The optimistic state was built on an older base or included a refused change.
    this.isSubmitting = false;
    if (isStale || this.hasDeferredRemote) this.showConfirmedPlusPending();
    this.hasDeferredRemote = false;
  }

  /** Someone else saved: their game becomes the base, and local changes go on top. */
  private receiveRemote(remote: GameState): void {
    if (remote.revision <= this.confirmed.revision) return;
    this.confirmed = remote;
    // Mid-submit, this can be the echo of the change being sent: replaying it on top would apply it twice.
    if (this.isSubmitting) this.hasDeferredRemote = true;
    else this.showConfirmedPlusPending();
  }

  private showConfirmedPlusPending(): void {
    this.show(replay(this.confirmed, this.pending, this.catalog), { kind: 'loaded' });
  }

  private show(state: GameState, change: StateChange, logged: readonly LogEntry[] = []): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state, change, logged));
  }
}

/** What the player sees: pending changes over the stored game, skipping any that no longer apply. */
function replay(base: GameState, pending: readonly Pending[], catalog: Catalog): GameState {
  return pending.reduce((state, change) => {
    if (change.kind === 'restore') return { ...change.state, revision: state.revision + 1 };
    const outcome = applyCommand(state, catalog, change.command, change.ctx);
    return outcome.ok ? outcome.state : state;
  }, base);
}
