import Phaser from 'phaser';

export const SPARK_TEXTURE = 'fx.spark';

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
    this.scene.start('Preload');
  }
}
