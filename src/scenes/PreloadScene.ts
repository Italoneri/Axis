import Phaser from 'phaser';
import { t } from '../i18n/pt-BR';
import type { LiveMap } from '../map/liveMap';
import type { AssetManifest } from '../model/schema';
import { MENU_IMAGE_PREFIX } from '../systems/TavernMenu';

const GOLD = 0xd4af37;
const RING_RADIUS = 46;

/**
 * Loads every image in the asset manifest (keys are the manifest keys), then
 * generates the map texture. Both phases share the same themed loading screen.
 */
export class PreloadScene extends Phaser.Scene {
  private label: Phaser.GameObjects.Text | undefined;
  private setProgress: (fraction: number) => void = () => undefined;

  constructor(
    private readonly manifest: AssetManifest,
    private readonly liveMap: LiveMap,
  ) {
    super('Preload');
  }

  preload(): void {
    this.drawLoadingScreen();
    this.load.on('progress', (value: number) => this.setProgress(value * 0.4));
    this.load.on('loaderror', (file: Phaser.Loader.File) =>
      console.error('[preload] failed to load', file.key, file.src),
    );
    // Menu photos are only shown in HTML (the tavern menu), which loads them on demand.
    const mapImages = Object.entries(this.manifest.images).filter(
      ([key]) => !key.startsWith(MENU_IMAGE_PREFIX),
    );
    for (const [key, path] of mapImages) {
      this.load.image(key, path);
    }
  }

  create(): void {
    this.label?.setText(t.forgingMap);
    this.liveMap
      .build(this.textures, (fraction) => this.setProgress(0.4 + fraction * 0.6))
      .then(() => this.scene.start('Base'))
      .catch((error: unknown) => {
        console.error('[map] generation failed', error);
        this.label?.setText(t.mapError);
      });
  }

  /** A gold ring that fills clockwise from North, like the Axis wall, with a slow turning glint. */
  private drawLoadingScreen(): void {
    const { width, height } = this.scale;
    const x = width / 2;
    const y = height / 2 - 16;
    this.cameras.main.setBackgroundColor('#2b2a2c');

    this.add.circle(x, y, RING_RADIUS).setStrokeStyle(6, 0xffffff, 0.08);
    const ring = this.add.graphics();
    const glint = this.add.circle(x, y - RING_RADIUS, 5, 0xf3e3a6);
    this.tweens.addCounter({
      from: 0,
      to: 360,
      duration: 2400,
      repeat: -1,
      onUpdate: (tween) => {
        const a = Phaser.Math.DegToRad(tween.getValue() ?? 0);
        glint.setPosition(x + RING_RADIUS * Math.sin(a), y - RING_RADIUS * Math.cos(a));
      },
    });
    this.setProgress = (fraction) => {
      ring.clear().lineStyle(6, GOLD, 1).beginPath();
      ring.arc(x, y, RING_RADIUS, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction);
      ring.strokePath();
    };
    this.label = this.add
      .text(x, y + RING_RADIUS + 34, t.loading, {
        fontFamily: 'Cinzel, serif',
        fontSize: '20px',
        color: '#f3e3a6',
      })
      .setOrigin(0.5);
  }
}
