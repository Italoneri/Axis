import type { Catalog } from './model/catalog';
import type { GameState } from './model/schema';
import { startBuild, startUpgrade, type BlockReason, type BuildOrder } from './systems/BuildSystem';
import { forceBuilding, removeBuilding, type ForceOrder } from './systems/MasterSystem';
import type { ActionError, Outcome } from './systems/outcome';
import { loadState, persistState } from './systems/SaveSystem';
import { advanceDays } from './systems/TimeSystem';

/** What happened, so views can animate the right thing instead of diffing states. */
export type StateChange =
  | { kind: 'loaded' }
  | { kind: 'construction_started'; slotId: string }
  | { kind: 'days_advanced'; completedSlotIds: string[] }
  | { kind: 'building_forced'; slotId: string }
  | { kind: 'building_removed'; slotId: string }
  | { kind: 'resources_changed' };

type Listener = (state: GameState, change: StateChange) => void;

/**
 * Imperative shell around the pure systems: owns the current state,
 * persists every change and notifies the Phaser scene and the HTML UI.
 */
export class GameStore {
  private state: GameState;
  private readonly listeners = new Set<Listener>();

  constructor(
    readonly catalog: Catalog,
    private readonly storage: Storage,
    private readonly onPersistError: (error: unknown) => void,
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

  build(order: BuildOrder): BlockReason[] {
    const result = startBuild(this.state, this.catalog, order);
    if (!result.ok) return result.reasons;
    this.commit(result.state, { kind: 'construction_started', slotId: order.slotId });
    return [];
  }

  upgrade(slotId: string): BlockReason[] {
    const result = startUpgrade(this.state, this.catalog, slotId);
    if (!result.ok) return result.reasons;
    this.commit(result.state, { kind: 'construction_started', slotId });
    return [];
  }

  advanceDays(days: number): void {
    const { state, completedSlotIds } = advanceDays(this.state, days);
    this.commit(state, { kind: 'days_advanced', completedSlotIds });
  }

  /**
   * Runs a pure resource action (deposit, master edits of coins, materials,
   * research, influence and characters). Returns the refusal, if any.
   */
  apply(action: (state: GameState) => Outcome): ActionError | null {
    const outcome = action(this.state);
    if (!outcome.ok) return outcome.error;
    if (outcome.state !== this.state) this.commit(outcome.state, { kind: 'resources_changed' });
    return null;
  }

  // Master actions: the UI only exposes them after the master password is entered.

  forceBuilding(order: ForceOrder): void {
    this.commit(forceBuilding(this.state, this.catalog, order), {
      kind: 'building_forced',
      slotId: order.slotId,
    });
  }

  removeBuilding(slotId: string): void {
    this.commit(removeBuilding(this.state, slotId), { kind: 'building_removed', slotId });
  }

  replace(state: GameState): void {
    this.commit(state, { kind: 'loaded' });
  }

  private commit(state: GameState, change: StateChange): void {
    this.state = state;
    try {
      persistState(this.storage, state);
    } catch (error) {
      // Quota or private-mode failures must not block play; the UI tells the user to export.
      this.onPersistError(error);
    }
    this.listeners.forEach((listener) => listener(state, change));
  }
}
