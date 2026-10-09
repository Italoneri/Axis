import Phaser from 'phaser';
import { availableArtFiles } from '../map/buildingArt';
import { Gates, type GateState } from '../map/gates';
import { MAP_TEXTURE, type LiveMap } from '../map/liveMap';
import { MAP_TEXTURE_KEYS, textureImage } from '../map/textures';
import { findBuilding } from '../model/catalog';
import type { GameState } from '../model/schema';
import type { GameStore, StateChange } from '../store';
import { CameraController } from './CameraController';
import { SlotView } from './SlotView';

const BACKGROUND = '#2b2a2c';
/** Served by the Vite dev server from the project root; not part of the build. */
const REFERENCE_URL = '/docs/map-reference/axis_preview.jpg';
const REFERENCE_KEY = 'map.reference';
const REFERENCE_DEPTH = 100;

export interface SlotSelection {
  open(slotId: string): void;
  close(): void;
  onSelectionChange(listener: (slotId: string | null) => void): void;
}

/** The generated Axis map with its gates and slots. Reads state from the store and reports clicks. */
export class BaseScene extends Phaser.Scene {
  private readonly slotViews = new Map<string, SlotView>();
  private gates: Gates | undefined;

  constructor(
    private readonly store: GameStore,
    private readonly selection: SlotSelection,
    private readonly liveMap: LiveMap,
  ) {
    super('Base');
  }

  /** Ready for gameplay hooks (an open portal, a sealed gate…); ids are the prism ids. */
  setGateState(gateId: string, state: GateState): void {
    this.gates?.setGateState(gateId, state);
  }

  create(): void {
    const { layout, size, theme } = this.liveMap;
    this.cameras.main.setBackgroundColor(BACKGROUND);
    this.add.image(0, 0, MAP_TEXTURE).setOrigin(0);
    const camera = new CameraController(this, size, size);

    this.gates = new Gates(this, {
      layout,
      mapSize: size,
      theme: theme.current,
      stone: textureImage(this.textures, MAP_TEXTURE_KEYS.wall),
      floor: textureImage(this.textures, MAP_TEXTURE_KEYS.floor),
    });
    const stopTheme = theme.subscribe((next) => this.gates?.setTheme(next));
    const stopReference = import.meta.env.DEV ? this.followReference() : () => undefined;

    const art = availableArtFiles(this.store.catalog.assets.images);
    for (const slot of layout.slots) {
      const view = new SlotView(this, {
        slot,
        mapSize: size,
        art,
        onClick: () => {
          if (!camera.wasDragging) this.selection.open(slot.id);
        },
      });
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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
      stopTheme();
      stopReference();
    });
  }

  /** Lays the reference render over the map so the two can be compared by fading it. */
  private followReference(): () => void {
    let overlay: Phaser.GameObjects.Image | undefined;
    let loading = false;
    const show = (opacity: number) => {
      overlay?.setAlpha(opacity);
      if (overlay || loading || opacity === 0) return;
      loading = true;
      this.load.image(REFERENCE_KEY, REFERENCE_URL);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        overlay = this.add
          .image(0, 0, REFERENCE_KEY)
          .setOrigin(0)
          .setDisplaySize(this.liveMap.size, this.liveMap.size)
          .setDepth(REFERENCE_DEPTH)
          .setAlpha(this.liveMap.referenceOpacity);
      });
      this.load.start();
    };
    return this.liveMap.onReferenceOpacity(show);
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
    if (change.kind === 'building_forced') {
      this.slotViews.get(change.slotId)?.playCompleted();
    }
    if (change.kind === 'days_advanced') {
      change.completedSlotIds.forEach((slotId) => this.slotViews.get(slotId)?.playCompleted());
    }
  }
}
