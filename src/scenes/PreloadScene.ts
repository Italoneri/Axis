import Phaser from 'phaser';
import { t } from '../i18n/pt-BR';
import type { AssetManifest } from '../model/schema';

const GOLD = 0xd4af37;

/** Loads every image listed in the asset manifest; keys are the manifest keys. */
export class PreloadScene extends Phaser.Scene {
  constructor(private readonly manifest: AssetManifest) {
    super('Preload');
  }

  preload(): void {
    const { width, height } = this.scale;
    const barWidth = Math.min(320, width * 0.7);
    const x = (width - barWidth) / 2;
    const y = height / 2;

    this.add
      .text(width / 2, y - 32, t.loading, {
        fontFamily: 'Cinzel, serif',
        fontSize: '20px',
        color: '#f3e3a6',
      })
      .setOrigin(0.5);
    this.add.rectangle(x, y, barWidth, 6, 0xffffff, 0.1).setOrigin(0, 0.5);
    const bar = this.add.rectangle(x, y, 0, 6, GOLD).setOrigin(0, 0.5);
    this.load.on('progress', (value: number) => bar.setSize(barWidth * value, 6));
    this.load.on('loaderror', (file: Phaser.Loader.File) =>
      console.error('[preload] failed to load', file.key, file.src),
    );

    for (const [key, path] of Object.entries(this.manifest.images)) {
      this.load.image(key, path);
    }
  }

  create(): void {
    this.scene.start('Base');
  }
}
