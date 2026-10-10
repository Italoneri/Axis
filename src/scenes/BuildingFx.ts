import Phaser from 'phaser';
import { placeFx, type ArtPlacement, type PlacedFx } from '../map/buildingArt';
import { toPixels } from '../map/geometry';
import type { BuildingFx as FxDef } from '../model/schema';
import { GLOW_TEXTURE, SPARK_TEXTURE } from './BootScene';
import { smokeTint, sparkTints } from './fxColors';

const SMOKE_PARTICLES = 12;
const SPARK_PARTICLES = 8;
/** Sparks fly about once every 1.2 s on average, never on a steady beat. */
const SPARK_CHECK_MS = 400;
const SPARK_CHANCE = 0.33;

/**
 * Caps the particles alive across the whole map, so a base full of forges
 * stays light on phones. Effects that do not fit are simply skipped.
 */
export class FxBudget {
  constructor(private available: number) {}

  /** Budget for small or low-power screens versus desktops. */
  static forScreen(width: number): FxBudget {
    return new FxBudget(width < 640 ? 60 : 160);
  }

  take(particles: number): boolean {
    if (particles > this.available) return false;
    this.available -= particles;
    return true;
  }

  release(particles: number): void {
    this.available += particles;
  }
}

export interface BuildingFxOptions {
  readonly placement: ArtPlacement;
  readonly effects: readonly FxDef[];
  readonly level: number;
  readonly mapSize: number;
  readonly depth: number;
  readonly budget: FxBudget;
}

interface Disposable {
  destroy(): void;
}

/** The animated effects of one finished building: smoke, pulsing glows and sparks. */
export class BuildingFx {
  private readonly parts: Disposable[] = [];
  private reserved = 0;
  /** Art width in pixels: the unit every effect is sized by. */
  private readonly unit: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: BuildingFxOptions,
  ) {
    this.unit = options.placement.width * options.mapSize;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    placeFx(options.placement, options.effects, options.level).forEach((placed) =>
      this.create(placed, reducedMotion),
    );
  }

  destroy(): void {
    this.parts.forEach((part) => part.destroy());
    this.parts.length = 0;
    this.options.budget.release(this.reserved);
    this.reserved = 0;
  }

  private create({ fx, point }: PlacedFx, reducedMotion: boolean): void {
    const { x, y } = toPixels(point, this.options.mapSize);
    if (fx.type === 'glow') {
      this.glow(x, y, fx.color, fx.radius * this.unit, reducedMotion);
      return;
    }
    if (reducedMotion) return;
    if (fx.type === 'smoke') this.smoke(x, y, fx.color);
    if (fx.type === 'sparks') this.sparks(x, y, fx.color);
  }

  private glow(x: number, y: number, color: string, radius: number, still: boolean): void {
    const image = this.scene.add
      .image(x, y, GLOW_TEXTURE)
      .setDisplaySize(radius * 2, radius * 2)
      .setTint(Phaser.Display.Color.HexStringToColor(color).color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.75)
      .setDepth(this.options.depth);
    this.parts.push(image);
    if (still) return;
    this.scene.tweens.add({
      targets: image,
      alpha: { from: 0.5, to: 0.95 },
      scaleX: image.scaleX * 1.08,
      scaleY: image.scaleY * 1.08,
      duration: Phaser.Math.Between(1100, 1600),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    this.parts.push({ destroy: () => this.scene.tweens.killTweensOf(image) });
  }

  /** Puffs (grey unless colored) that drift up slowly while they grow and fade. */
  private smoke(x: number, y: number, color?: string): void {
    if (!this.reserve(SMOKE_PARTICLES)) return;
    const puff = this.unit / 64;
    const emitter = this.scene.add
      .particles(x, y, GLOW_TEXTURE, {
        lifespan: { min: 2600, max: 3600 },
        frequency: 280,
        maxAliveParticles: SMOKE_PARTICLES,
        speed: { min: this.unit * 0.03, max: this.unit * 0.08 },
        accelerationY: -this.unit * 0.04,
        scale: { start: puff * 0.12, end: puff * 0.4, ease: 'Quad.Out' },
        alpha: { start: 0.6, end: 0, ease: 'Quad.In' },
        tint: smokeTint(color),
      })
      .setDepth(this.options.depth);
    this.parts.push(emitter);
  }

  /** Short bursts at random intervals, like hammer strikes. */
  private sparks(x: number, y: number, color?: string): void {
    if (!this.reserve(SPARK_PARTICLES)) return;
    const emitter = this.scene.add
      .particles(x, y, SPARK_TEXTURE, {
        lifespan: { min: 250, max: 520 },
        maxAliveParticles: SPARK_PARTICLES,
        speed: { min: this.unit * 0.08, max: this.unit * 0.25 },
        scale: { start: this.unit / 1400, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: sparkTints(color),
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(this.options.depth);
    const timer = this.scene.time.addEvent({
      delay: SPARK_CHECK_MS,
      loop: true,
      callback: () => {
        if (Math.random() < SPARK_CHANCE) emitter.explode(Phaser.Math.Between(3, 6));
      },
    });
    this.parts.push(emitter, { destroy: () => timer.remove() });
  }

  private reserve(particles: number): boolean {
    if (!this.options.budget.take(particles)) return false;
    this.reserved += particles;
    return true;
  }
}
