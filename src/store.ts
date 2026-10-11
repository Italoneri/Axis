import { applyCommand, type CommandError, type StateChange } from './commands/applyCommand';
import type { CommandContext, GameCommand } from './commands/schema';
import type { Catalog } from './model/catalog';
import type { GameState } from './model/schema';
import { loadState, persistState } from './systems/SaveSystem';

export type { StateChange } from './commands/applyCommand';

type Listener = (state: GameState, change: StateChange) => void;

export interface StoreHooks {
  /** Who is acting for this command; the store never decides permissions itself. */
  contextFor: (command: GameCommand) => CommandContext;
  onRefused: (error: CommandError) => void;
  onPersistError: (error: unknown) => void;
}

/**
 * Imperative shell around `applyCommand`: owns the current state, persists
 * every change and notifies the Phaser scene and the HTML UI.
 */
export class GameStore {
  private state: GameState;
  private readonly listeners = new Set<Listener>();

  constructor(
    readonly catalog: Catalog,
    private readonly storage: Storage,
    private readonly hooks: StoreHooks,
  ) {
    this.state = loadState(storage, catalog);
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
    const outcome = applyCommand(this.state, this.catalog, command, this.hooks.contextFor(command));
    if (!outcome.ok) {
      this.hooks.onRefused(outcome.error);
      return outcome.error;
    }
    if (outcome.state !== this.state) this.commit(outcome.state, outcome.change);
    return null;
  }

  /** Restores an imported save (already validated by `parseSave`). */
  replace(state: GameState): void {
    this.commit(state, { kind: 'loaded' });
  }

  private commit(state: GameState, change: StateChange): void {
    this.state = state;
    try {
      persistState(this.storage, state);
    } catch (error) {
      // Quota or private-mode failures must not block play; the UI tells the user to export.
      this.hooks.onPersistError(error);
    }
    this.listeners.forEach((listener) => listener(state, change));
  }
}
