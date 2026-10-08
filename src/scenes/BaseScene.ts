import Phaser from 'phaser';
import { findBuilding } from '../model/catalog';
import type { GameState } from '../model/schema';
import type { GameStore, StateChange } from '../store';
import { CameraController } from './CameraController';
import { SlotView } from './SlotView';

const MAP_KEY = 'map';

export interface SlotSelection {
  open(slotId: string): void;
  close(): void;
  onSelectionChange(listener: (slotId: string | null) => void): void;
}

/** The Axis map with its slots. Reads state from the store and reports clicks to the panel. */
export class BaseScene extends Phaser.Scene {
  private readonly slotViews = new Map<string, SlotView>();

  constructor(
    private readonly store: GameStore,
    private readonly selection: SlotSelection,
  ) {
    super('Base');
  }

  create(): void {
    const map = this.add.image(0, 0, MAP_KEY).setOrigin(0);
    const camera = new CameraController(this, map.width, map.height);
    const { sizes, slots } = this.store.catalog.slots;

    for (const slot of slots) {
      const view = new SlotView(
        this,
        slot.x * map.width,
        slot.y * map.height,
        sizes[slot.type] * map.width,
        () => {
          if (!camera.wasDragging) this.selection.open(slot.id);
        },
      );
      this.slotViews.set(slot.id, view);
    }

    // A click on bare map (not a pan) dismisses the panel.
    this.input.on(
      'pointerup',
      (_pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (!camera.wasDragging && over.length === 0) this.selection.close();
      },
    );

    this.selection.onSelectionChange((selectedId) => {
      this.slotViews.forEach((view, id) => view.setSelected(id === selectedId));
    });

    this.render(this.store.current);
    const unsubscribe = this.store.subscribe((state, change) => {
      this.render(state);
      this.animate(state, change);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  }

  private render(state: GameState): void {
    this.slotViews.forEach((view, slotId) => {
      const placed = state.slots[slotId];
      const def = placed && findBuilding(this.store.catalog, placed.buildingId);
      view.update({ placed, def, day: state.day });
    });
  }

  private animate(state: GameState, change: StateChange): void {
    if (change.kind === 'construction_started') {
      const placed = state.slots[change.slotId];
      const view = this.slotViews.get(change.slotId);
      view?.playConstructionStarted(placed?.level === 1);
      if (placed?.status === 'done') view?.playCompleted();
    }
    if (change.kind === 'days_advanced') {
      change.completedSlotIds.forEach((slotId) => this.slotViews.get(slotId)?.playCompleted());
    }
  }
}
