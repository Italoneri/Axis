import Phaser from 'phaser';

export const SPARK_TEXTURE = 'fx.spark';
/** Soft white blob for glows and smoke puffs, tinted at use. */
export const GLOW_TEXTURE = 'fx.glow';
const GLOW_SIZE = 64;

/** Creates the tiny runtime textures used by effects, then hands over to the preloader. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const g = this.make.graphics({}, false);
    g.fillStyle(0xffffff, 0.35).fillCircle(8, 8, 8);
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 4);
    g.generateTexture(SPARK_TEXTURE, 16, 16);
    g.destroy();
    this.createGlowTexture();
    this.scene.start('Preload');
  }

  private createGlowTexture(): void {
    const texture = this.textures.createCanvas(GLOW_TEXTURE, GLOW_SIZE, GLOW_SIZE);
    const ctx = texture?.getContext();
    if (!texture || !ctx) {
      console.warn('[boot] could not create the glow texture; building glows will not show');
      return;
    }
    const half = GLOW_SIZE / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
    texture.refresh();
  }
}
