import Phaser from 'phaser';
import { artPlacement, artTextureKey, pickArtFile, type ArtPlacement } from '../map/buildingArt';
import {
  slotBounds,
  slotContains,
  slotOutline,
  slotSpriteSize,
  toPixels,
  type Point,
} from '../map/geometry';
import type { SlotDef } from '../map/layout';
import type { BuildingDef, PlacedBuilding } from '../model/schema';
import { constructionProgress } from '../systems/TimeSystem';
import { SPARK_TEXTURE } from './BootScene';
import { BuildingFx, type FxBudget } from './BuildingFx';

const GOLD = 0xd4af37;
const GOLD_SOFT = 0xf3e3a6;
const FOUNDATION_FILL = 0x141218;
const FOUNDATION_ALPHA = 0.47;
/** Final art of a structure still under construction: a faint preview of the target level. */
const CONSTRUCTION_ART_ALPHA = 0.35;
const SCAFFOLD_SPACING = 14;
const DASH = 10;
const DASH_GAP = 7;

/** Draw order on the map: foundations under the gates, buildings above everything. */
export const SLOT_DEPTH = { foundation: 10, building: 30, scaffold: 31, fx: 32 };

export interface SlotViewOptions {
  readonly slot: SlotDef;
  readonly mapSize: number;
  /** Final art files available (see buildingArt.ts); missing art falls back to the placeholder. */
  readonly art: ReadonlySet<string>;
  readonly fxBudget: FxBudget;
  readonly onClick: () => void;
}

export interface SlotViewModel {
  placed: PlacedBuilding | undefined;
  def: BuildingDef | undefined;
  day: number;
}

/** What the slot shows: final art shaped to the slot, the square placeholder, or nothing. */
type Look =
  | { kind: 'art'; textureKey: string }
  | { kind: 'placeholder'; textureKey: string }
  | { kind: 'empty' };

/**
 * Everything drawn for one slot: its foundation (arc, square or the core circle),
 * the building art or placeholder sprite and the construction progress ring. Clicks
 * are tested against the real shape, so neighbouring arcs never steal each other's taps.
 * The level is shown in the slot panel only.
 */
export class SlotView {
  private readonly foundation: Phaser.GameObjects.Graphics;
  private readonly container: Phaser.GameObjects.Container;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly art: Phaser.GameObjects.Image;
  private readonly scaffold: Phaser.GameObjects.Graphics;
  private readonly size: number;
  private readonly placement: ArtPlacement;
  private hovered = false;
  private selected = false;
  private shown: Look = { kind: 'empty' };
  private fx: { key: string; effects: BuildingFx } | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: SlotViewOptions,
  ) {
    const { slot, mapSize } = options;
    const center = toPixels(slot, mapSize);
    this.size = slotSpriteSize(slot) * mapSize;
    this.placement = artPlacement(slot);
    this.foundation = scene.add.graphics().setDepth(SLOT_DEPTH.foundation);
    this.sprite = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    const shape = this.createShapeMask();
    this.art = this.createArtImage().setMask(shape);
    this.scaffold = scene.add.graphics().setDepth(SLOT_DEPTH.scaffold).setMask(shape);
    this.ring = scene.add.graphics();
    this.container = scene.add
      .container(center.x, center.y, [this.sprite, this.ring])
      .setDepth(SLOT_DEPTH.building);
    this.createHitArea();
    this.drawFoundation();
  }

  update({ placed, def, day }: SlotViewModel): void {
    const isBuilding = placed?.status === 'building';
    this.show(this.lookFor(placed, def));
    this.drawScaffold(isBuilding && this.shown.kind === 'art');
    this.syncFx(placed, def);

    this.art.setAlpha(isBuilding ? CONSTRUCTION_ART_ALPHA : 1);
    this.sprite.setAlpha(isBuilding ? 0.55 : 1);
    if (isBuilding) this.sprite.setTint(0x9a9a9a);
    else this.sprite.clearTint();

    this.drawProgress(placed ? constructionProgress(placed, day) : 1, isBuilding);
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.drawFoundation();
  }

  /** Scale-in for a new structure, a short pop for an upgrade. */
  playConstructionStarted(isNew: boolean): void {
    const image = this.shownImage();
    const { scaleX, scaleY } = image;
    const from = isNew ? 0 : 1.15;
    image.setScale(scaleX * from, scaleY * from);
    this.scene.tweens.add({
      targets: image,
      scaleX,
      scaleY,
      duration: isNew ? 550 : 350,
      ease: 'Back.Out',
    });
  }

  playCompleted(): void {
    const emitter = this.scene.add
      .particles(this.container.x, this.container.y, SPARK_TEXTURE, {
        speed: { min: this.size * 0.4, max: this.size * 1.8 },
        lifespan: { min: 600, max: 1100 },
        scale: { start: this.size / 120, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [GOLD, GOLD_SOFT, 0xffffff],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(SLOT_DEPTH.scaffold + 1);
    emitter.explode(48);
    this.scene.time.delayedCall(1300, () => emitter.destroy());

    const image = this.shownImage();
    this.scene.tweens.add({
      targets: image,
      scaleX: image.scaleX * 1.12,
      scaleY: image.scaleY * 1.12,
      duration: 180,
      yoyo: true,
      ease: 'Quad.Out',
    });
  }

  private lookFor(placed: PlacedBuilding | undefined, def: BuildingDef | undefined): Look {
    if (!placed || !def) return { kind: 'empty' };
    const file = pickArtFile(this.options.art, def.id, this.options.slot.type, placed.level);
    return file
      ? { kind: 'art', textureKey: artTextureKey(file) }
      : { kind: 'placeholder', textureKey: def.sprite };
  }

  private show(look: Look): void {
    if (isSameLook(look, this.shown)) return;
    this.shown = look;
    const { mapSize } = this.options;
    if (look.kind === 'art') {
      const { width, height } = this.placement;
      this.art.setTexture(look.textureKey).setDisplaySize(width * mapSize, height * mapSize);
    }
    if (look.kind === 'placeholder') {
      this.sprite.setTexture(look.textureKey).setDisplaySize(this.size, this.size);
    }
    this.art.setVisible(look.kind === 'art');
    this.sprite.setVisible(look.kind === 'placeholder');
  }

  /** Effects run on finished final art only: their coordinates point into that image. */
  private syncFx(placed: PlacedBuilding | undefined, def: BuildingDef | undefined): void {
    const effects = def?.fx ?? [];
    const isActive = placed?.status === 'done' && this.shown.kind === 'art' && effects.length > 0;
    const key = isActive ? `${this.shownKey()}:${placed.level}` : null;
    if (key === (this.fx?.key ?? null)) return;
    this.fx?.effects.destroy();
    this.fx = null;
    if (!key || !placed) return;
    const fx = new BuildingFx(this.scene, {
      placement: this.placement,
      effects,
      level: placed.level,
      mapSize: this.options.mapSize,
      depth: SLOT_DEPTH.fx,
      budget: this.options.fxBudget,
    });
    this.fx = { key, effects: fx };
  }

  private shownKey(): string {
    return this.shown.kind === 'empty' ? '' : this.shown.textureKey;
  }

  private shownImage(): Phaser.GameObjects.Image {
    return this.shown.kind === 'art' ? this.art : this.sprite;
  }

  /** The art lives in map space: for arcs its box is not centered on the slot's (x, y). */
  private createArtImage(): Phaser.GameObjects.Image {
    const { center, rotation } = this.placement;
    const { x, y } = toPixels(center, this.options.mapSize);
    return this.scene.add
      .image(x, y, '__DEFAULT')
      .setRotation(Phaser.Math.DegToRad(rotation))
      .setDepth(SLOT_DEPTH.building)
      .setVisible(false);
  }

  /** Clips the art and the scaffold to the exact foundation, so arcs keep their curve. */
  private createShapeMask(): Phaser.Display.Masks.GeometryMask {
    const g = this.scene.make.graphics({}, false).fillStyle(0xffffff);
    g.fillPoints(this.outlinePixels(), true);
    return g.createGeometryMask();
  }

  private outlinePixels(): Point[] {
    const { slot, mapSize } = this.options;
    if (slot.shape === 'round') {
      return circlePoints(toPixels(slot, mapSize), (slot.size / 2) * mapSize);
    }
    return slotOutline(slot).map((p) => toPixels(p, mapSize));
  }

  /** Gold hatching and a dashed outline over the faint art while it is being built. */
  private drawScaffold(visible: boolean): void {
    const g = this.scaffold.clear();
    if (!visible) return;
    const { slot, mapSize } = this.options;
    const bounds = slotBounds(slot);
    const left = bounds.left * mapSize;
    const top = bounds.top * mapSize;
    const width = bounds.width * mapSize;
    const height = bounds.height * mapSize;
    const stroke = Math.max(1, mapSize / 900);

    g.lineStyle(stroke, GOLD, 0.45);
    for (let offset = -height; offset < width; offset += SCAFFOLD_SPACING * stroke) {
      g.lineBetween(left + offset, top + height, left + offset + height, top);
    }
    const outline = this.outlinePixels();
    g.lineStyle(stroke * 2, GOLD, 0.9);
    strokeDashed(g, [...outline, ...outline.slice(0, 1)], DASH * stroke, DASH_GAP * stroke);
  }

  /** A zone over the slot's bounding box whose hit test checks the exact shape. */
  private createHitArea(): void {
    const { slot, mapSize, onClick } = this.options;
    const bounds = slotBounds(slot);
    const left = bounds.left * mapSize;
    const top = bounds.top * mapSize;
    const width = bounds.width * mapSize;
    const height = bounds.height * mapSize;
    const zone = this.scene.add.zone(left + width / 2, top + height / 2, width, height);
    zone.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, 0, width, height),
      hitAreaCallback: (_area: Phaser.Geom.Rectangle, x: number, y: number) =>
        slotContains(slot, { x: (left + x) / mapSize, y: (top + y) / mapSize }),
      useHandCursor: true,
    });
    zone.on('pointerover', () => this.setHovered(true));
    zone.on('pointerout', () => this.setHovered(false));
    zone.on('pointerup', onClick);
  }

  private setHovered(hovered: boolean): void {
    this.hovered = hovered;
    this.drawFoundation();
  }

  /** Dark translucent footprint with a discreet gold edge that lights up on hover. */
  private drawFoundation(): void {
    const { slot, mapSize } = this.options;
    const highlighted = this.hovered || this.selected;
    const stroke = Math.max(1, mapSize / 800);
    const g = this.foundation.clear();

    if (slot.shape === 'round') {
      if (!highlighted) return;
      const { x, y } = toPixels(slot, mapSize);
      const radius = (slot.size / 2) * mapSize;
      for (const [width, alpha] of glowStrokes(stroke)) {
        g.lineStyle(width, GOLD_SOFT, alpha).strokeCircle(x, y, radius);
      }
      return;
    }

    const points = slotOutline(slot).map((p) => toPixels(p, mapSize));
    g.fillStyle(FOUNDATION_FILL, FOUNDATION_ALPHA).fillPoints(points, true);
    if (!highlighted) {
      g.lineStyle(stroke, GOLD, 0.6).strokePoints(points, true);
      return;
    }
    for (const [width, alpha] of glowStrokes(stroke)) {
      g.lineStyle(width, GOLD_SOFT, alpha).strokePoints(points, true);
    }
  }

  private drawProgress(progress: number, isBuilding: boolean): void {
    this.ring.clear();
    if (!isBuilding) return;
    const radius = this.size * 0.58;
    const width = Math.max(3, this.size * 0.05);
    this.ring.lineStyle(width, 0x000000, 0.55).strokeCircle(0, 0, radius);
    this.ring.lineStyle(width, GOLD, 1);
    this.ring.beginPath();
    this.ring.arc(
      0,
      0,
      radius,
      -Math.PI / 2,
      -Math.PI / 2 + Math.max(0.02, progress) * Math.PI * 2,
    );
    this.ring.strokePath();
  }
}

function isSameLook(a: Look, b: Look): boolean {
  if (a.kind === 'empty' || b.kind === 'empty') return a.kind === b.kind;
  return a.kind === b.kind && a.textureKey === b.textureKey;
}

function circlePoints(center: Point, radius: number, steps = 64): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return { x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) };
  });
}

/** Phaser has no dashed lines: walks the polyline and strokes every other stretch. */
function strokeDashed(
  g: Phaser.GameObjects.Graphics,
  points: readonly Point[],
  dash: number,
  gap: number,
): void {
  let drawing = true;
  let remaining = dash;
  points.slice(1).forEach((end, i) => {
    let start = points[i] ?? end;
    let length = Math.hypot(end.x - start.x, end.y - start.y);
    while (length > 0) {
      const step = Math.min(remaining, length);
      const t = step / length;
      const next = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
      if (drawing) g.lineBetween(start.x, start.y, next.x, next.y);
      start = next;
      length -= step;
      remaining -= step;
      if (remaining <= 0) {
        drawing = !drawing;
        remaining = drawing ? dash : gap;
      }
    }
  });
}

/** Wide faint strokes under a crisp one fake a glow without a shader. */
function glowStrokes(base: number): [number, number][] {
  return [
    [base * 7, 0.12],
    [base * 4, 0.25],
    [base * 1.5, 1],
  ];
}
