import Phaser from 'phaser';
import { slotBounds, slotContains, slotOutline, slotSpriteSize, toPixels } from '../map/geometry';
import type { SlotDef } from '../map/layout';
import type { BuildingDef, PlacedBuilding } from '../model/schema';
import { constructionProgress } from '../systems/TimeSystem';
import { SPARK_TEXTURE } from './BootScene';

const GOLD = 0xd4af37;
const GOLD_SOFT = 0xf3e3a6;
const FOUNDATION_FILL = 0x141218;
const FOUNDATION_ALPHA = 0.47;
const LEVEL_LABELS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Draw order on the map: foundations under the gates, buildings above everything. */
export const SLOT_DEPTH = { foundation: 10, building: 30 };

export interface SlotViewOptions {
  readonly slot: SlotDef;
  readonly mapSize: number;
  readonly onClick: () => void;
}

export interface SlotViewModel {
  placed: PlacedBuilding | undefined;
  def: BuildingDef | undefined;
  day: number;
}

/**
 * Everything drawn for one slot: its foundation (arc, square or the core circle),
 * the building sprite, level badge and progress ring. Clicks are tested against
 * the real shape, so neighbouring arcs never steal each other's taps.
 */
export class SlotView {
  private readonly foundation: Phaser.GameObjects.Graphics;
  private readonly container: Phaser.GameObjects.Container;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly badge: Phaser.GameObjects.Text;
  private readonly size: number;
  private hovered = false;
  private selected = false;
  private shownSpriteKey: string | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: SlotViewOptions,
  ) {
    const { slot, mapSize } = options;
    const center = toPixels(slot, mapSize);
    this.size = slotSpriteSize(slot) * mapSize;
    this.foundation = scene.add.graphics().setDepth(SLOT_DEPTH.foundation);
    this.sprite = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    this.ring = scene.add.graphics();
    this.badge = scene.add
      .text(0, this.size * 0.46, '', {
        fontFamily: 'Cinzel, serif',
        fontStyle: 'bold',
        fontSize: `${Math.round(this.size * 0.2)}px`,
        color: '#f3e3a6',
        stroke: '#000000',
        strokeThickness: Math.max(3, this.size * 0.04),
      })
      .setOrigin(0.5);
    this.container = scene.add
      .container(center.x, center.y, [this.sprite, this.ring, this.badge])
      .setDepth(SLOT_DEPTH.building);
    this.createHitArea();
    this.drawFoundation();
  }

  update({ placed, def, day }: SlotViewModel): void {
    const spriteKey = placed && def ? def.sprite : null;
    if (spriteKey !== this.shownSpriteKey) {
      this.shownSpriteKey = spriteKey;
      if (spriteKey) this.sprite.setTexture(spriteKey).setDisplaySize(this.size, this.size);
      this.sprite.setVisible(spriteKey !== null);
    }

    const isBuilding = placed?.status === 'building';
    this.sprite.setAlpha(isBuilding ? 0.55 : 1);
    if (isBuilding) this.sprite.setTint(0x9a9a9a);
    else this.sprite.clearTint();

    this.badge.setText(placed ? (LEVEL_LABELS[placed.level - 1] ?? String(placed.level)) : '');
    this.drawProgress(placed ? constructionProgress(placed, day) : 1, isBuilding);
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.drawFoundation();
  }

  /** Scale-in for a new structure, a short pop for an upgrade. */
  playConstructionStarted(isNew: boolean): void {
    const targetScale = this.sprite.scale;
    if (isNew) this.sprite.setScale(0);
    this.scene.tweens.add({
      targets: this.sprite,
      scale: isNew ? targetScale : { from: targetScale * 1.15, to: targetScale },
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
      .setDepth(SLOT_DEPTH.building + 1);
    emitter.explode(48);
    this.scene.time.delayedCall(1300, () => emitter.destroy());

    const scale = this.sprite.scale;
    this.scene.tweens.add({
      targets: this.sprite,
      scale: scale * 1.12,
      duration: 180,
      yoyo: true,
      ease: 'Quad.Out',
    });
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

    if (slot.type === 'core') {
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

/** Wide faint strokes under a crisp one fake a glow without a shader. */
function glowStrokes(base: number): [number, number][] {
  return [
    [base * 7, 0.12],
    [base * 4, 0.25],
    [base * 1.5, 1],
  ];
}
