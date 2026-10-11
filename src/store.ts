import { applyCommand, type CommandError, type StateChange } from './commands/applyCommand';
import type { CommandContext, GameCommand } from './commands/schema';
import type { Catalog } from './model/catalog';
import type { GameState } from './model/schema';
import type { GameRepository } from './persistence/GameRepository';

export type { StateChange } from './commands/applyCommand';

type Listener = (state: GameState, change: StateChange) => void;

export interface StoreHooks {
  /** Who is acting for this command; the store never decides permissions itself. */
  contextFor: (command: GameCommand) => CommandContext;
  onRefused: (error: CommandError) => void;
  onPersistError: (error: unknown) => void;
}

/** A local change not yet accepted by the repository. */
type Pending =
  | { kind: 'command'; command: GameCommand; ctx: CommandContext }
  /** An imported save: it replaces whatever is stored. */
  | { kind: 'restore'; state: GameState };

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
    this.enqueue({ kind: 'command', command, ctx }, outcome.state, outcome.change);
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

  private enqueue(change: Pending, next: GameState, stateChange: StateChange): void {
    this.pending.push(change);
    this.show(next, stateChange);
    this.syncing = this.syncing.then(() => this.sync());
  }

  private async sync(): Promise<void> {
    let conflicts = 0;
    while (this.pending.length > 0) {
      const batch = [...this.pending];
      const { state: candidate, refused } = replay(this.confirmed, batch, this.catalog);
      let result;
      try {
        result = await this.repository.save(candidate, this.confirmed.revision);
      } catch (error) {
        // Kept pending: the next change retries them, and the game stays playable meanwhile.
        this.hooks.onPersistError(error);
        return;
      }
      if (result.ok) {
        this.confirmed = candidate;
        this.pending = this.pending.slice(batch.length);
        // After a conflict the optimistic state was built on an old base: show the replayed one.
        if (refused.length > 0 || conflicts > 0) this.settle(refused);
        continue;
      }
      conflicts++;
      this.confirmed = await this.repository.load();
      if (conflicts >= MAX_CONFLICTS) {
        console.warn('[save] giving up after repeated conflicts', { dropped: this.pending.length });
        this.pending = [];
        this.settle(['conflict']);
        return;
      }
    }
  }

  /** Someone else saved: their game becomes the base, and local changes go on top. */
  private receiveRemote(remote: GameState): void {
    if (remote.revision <= this.confirmed.revision) return;
    this.confirmed = remote;
    this.show(replay(remote, this.pending, this.catalog).state, { kind: 'loaded' });
  }

  /** Shows the saved game plus whatever is still pending, and reports what was undone. */
  private settle(errors: CommandError[]): void {
    errors.forEach((error) => this.hooks.onRefused(error));
    this.show(replay(this.confirmed, this.pending, this.catalog).state, { kind: 'loaded' });
  }

  private show(state: GameState, change: StateChange): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state, change));
  }
}

/** Applies pending changes over a base; commands the newer base no longer allows are dropped. */
function replay(
  base: GameState,
  pending: readonly Pending[],
  catalog: Catalog,
): { state: GameState; refused: CommandError[] } {
  return pending.reduce<{ state: GameState; refused: CommandError[] }>(
    ({ state, refused }, change) => {
      if (change.kind === 'restore') {
        return { state: { ...change.state, revision: state.revision + 1 }, refused };
      }
      const outcome = applyCommand(state, catalog, change.command, change.ctx);
      return outcome.ok
        ? { state: outcome.state, refused }
        : { state, refused: [...refused, outcome.error] };
    },
    { state: base, refused: [] },
  );
}
