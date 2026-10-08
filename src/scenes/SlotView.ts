import Phaser from 'phaser';
import type { BuildingDef, PlacedBuilding } from '../model/schema';
import { constructionProgress } from '../systems/TimeSystem';
import { SPARK_TEXTURE } from './BootScene';

const GOLD = 0xd4af37;
const GOLD_SOFT = 0xf3e3a6;
const LEVEL_LABELS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export interface SlotViewModel {
  placed: PlacedBuilding | undefined;
  def: BuildingDef | undefined;
  day: number;
}

/** Everything drawn for one slot: idle glow, building sprite, level badge and progress ring. */
export class SlotView {
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly badge: Phaser.GameObjects.Text;
  private readonly glowPulse: Phaser.Tweens.Tween;
  private hovered = false;
  private selected = false;
  private isEmpty = true;
  private shownSpriteKey: string | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    private readonly size: number,
    onClick: () => void,
  ) {
    const radius = size / 2;
    this.glow = scene.add.graphics({ x, y }).setBlendMode(Phaser.BlendModes.ADD);
    this.sprite = scene.add.image(x, y, '__DEFAULT').setVisible(false);
    this.ring = scene.add.graphics({ x, y });
    this.badge = scene.add
      .text(x, y + radius * 0.92, '', {
        fontFamily: 'Cinzel, serif',
        fontStyle: 'bold',
        fontSize: `${Math.round(size * 0.2)}px`,
        color: '#f3e3a6',
        stroke: '#000000',
        strokeThickness: Math.max(3, size * 0.04),
      })
      .setOrigin(0.5);

    this.glowPulse = scene.tweens.add({
      targets: this.glow,
      alpha: { from: 0.45, to: 0.9 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    const hitArea = scene.add.zone(x, y, size, size).setInteractive({
      hitArea: new Phaser.Geom.Circle(radius, radius, radius),
      hitAreaCallback: Phaser.Geom.Circle.Contains,
      useHandCursor: true,
    });
    hitArea.on('pointerover', () => this.setHovered(true));
    hitArea.on('pointerout', () => this.setHovered(false));
    hitArea.on('pointerup', onClick);
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
    this.isEmpty = placed === undefined;
    this.redrawGlow();
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.redrawGlow();
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
    const emitter = this.scene.add.particles(this.x, this.y, SPARK_TEXTURE, {
      speed: { min: this.size * 0.4, max: this.size * 1.8 },
      lifespan: { min: 600, max: 1100 },
      scale: { start: this.size / 120, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [GOLD, GOLD_SOFT, 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
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

  private setHovered(hovered: boolean): void {
    this.hovered = hovered;
    this.redrawGlow();
  }

  private redrawGlow(): void {
    const radius = this.size / 2;
    const highlighted = this.hovered || this.selected;
    this.glow.clear();
    this.glowPulse.paused = highlighted;
    this.glow.setAlpha(highlighted ? 1 : this.glow.alpha);

    if (!this.isEmpty && !highlighted) return;
    const strength = highlighted ? 1 : 0.6;
    // Concentric translucent discs fake a soft radial glow without a texture.
    for (let i = 4; i >= 1; i--) {
      this.glow.fillStyle(GOLD, 0.05 * strength).fillCircle(0, 0, radius * (0.55 + i * 0.12));
    }
    this.glow.lineStyle(
      Math.max(2, this.size * 0.025),
      highlighted ? GOLD_SOFT : GOLD,
      0.8 * strength,
    );
    this.glow.strokeCircle(0, 0, radius * 0.62);
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
