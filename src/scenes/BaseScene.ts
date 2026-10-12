import Phaser from 'phaser';
import { availableArtFiles } from '../map/buildingArt';
import type { BuildingPreview } from '../map/buildingPreview';
import { Gates, type GateState } from '../map/gates';
import { MAP_TEXTURE, type LiveMap } from '../map/liveMap';
import { MAP_TEXTURE_KEYS, textureImage } from '../map/textures';
import { findBuilding } from '../model/catalog';
import type { GameState, PlacedBuilding } from '../model/schema';
import type { GameStore, StateChange } from '../store';
import { FxBudget } from './BuildingFx';
import { CameraController } from './CameraController';
import { isCanvasGesture } from './pointerGesture';
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
    private readonly preview: BuildingPreview,
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
    const fxBudget = FxBudget.forScreen(this.scale.width);
    for (const slot of layout.slots) {
      const view = new SlotView(this, {
        slot,
        mapSize: size,
        art,
        fxBudget,
        onClick: () => {
          if (!camera.wasDragging) this.selection.open(slot.id);
        },
      });
      this.slotViews.set(slot.id, view);
    }

    // A click on bare map (not a pan) dismisses the panel.
    this.input.on(
      'pointerup',
      (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        const isMapClick = isCanvasGesture(pointer, this.game.canvas) && !camera.wasDragging;
        if (isMapClick && over.length === 0) this.selection.close();
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
    const stopPreview = this.preview.subscribe(() => this.render(this.store.current));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
      stopPreview();
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

  /** The master's preview replaces what the slot really holds, on screen only. */
  private render(state: GameState): void {
    const preview = this.preview.current;
    this.slotViews.forEach((view, slotId) => {
      const previewed: PlacedBuilding | undefined =
        preview?.slotId === slotId
          ? { buildingId: preview.buildingId, level: preview.level, status: 'done' }
          : undefined;
      const placed = previewed ?? state.slots[slotId];
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
