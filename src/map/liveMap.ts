import type Phaser from 'phaser';
import type { MapLayout } from './layout';
import { MapGenerator } from './mapGenerator';
import { mapTextures } from './textures';
import type { ThemeStore } from './theme';

export const MAP_TEXTURE = 'map';
const REGENERATE_DEBOUNCE_MS = 250;

export interface MapTimings {
  /** Texture analysis (gold veins), done once per load. */
  readonly analysisMs: number;
  /** Last full paint of the static layers. */
  readonly renderMs: number;
}

type TimingListener = (timings: MapTimings) => void;
type OpacityListener = (opacity: number) => void;

/**
 * Owns the generated map texture: builds it once on load and repaints it, with
 * a debounce, whenever the master moves a theme slider.
 */
export class LiveMap {
  private readonly canvas = document.createElement('canvas');
  private texture: Phaser.Textures.CanvasTexture | null = null;
  private generator: MapGenerator | null = null;
  private running: AbortController | null = null;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private current: MapTimings = { analysisMs: 0, renderMs: 0 };
  private readonly listeners = new Set<TimingListener>();
  private readonly referenceListeners = new Set<OpacityListener>();
  private reference = 0;

  constructor(
    readonly layout: MapLayout,
    readonly theme: ThemeStore,
    readonly size: number,
  ) {}

  get timings(): MapTimings {
    return this.current;
  }

  /** Opacity of docs/map-reference/axis_preview.jpg drawn over the map (dev server only). */
  get referenceOpacity(): number {
    return this.reference;
  }

  setReferenceOpacity(opacity: number): void {
    this.reference = opacity;
    this.referenceListeners.forEach((listener) => listener(opacity));
  }

  onReferenceOpacity(listener: OpacityListener): () => void {
    this.referenceListeners.add(listener);
    return () => this.referenceListeners.delete(listener);
  }

  onRendered(listener: TimingListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Generates the map from the loaded textures and registers it as the "map" texture. */
  async build(
    textures: Phaser.Textures.TextureManager,
    onProgress: (fraction: number) => void,
  ): Promise<void> {
    const started = performance.now();
    const generator = await MapGenerator.create(mapTextures(textures), this.size, {
      onProgress: (f) => onProgress(f * 0.5),
    });
    const analysisMs = performance.now() - started;
    await generator.render(this.canvas, this.layout, this.theme.current, {
      onProgress: (f) => onProgress(0.5 + f * 0.5),
    });
    this.generator = generator;
    this.texture = textures.addCanvas(MAP_TEXTURE, this.canvas);
    this.report({ analysisMs, renderMs: performance.now() - started - analysisMs });
    this.theme.subscribe(() => this.scheduleRender());
  }

  private scheduleRender(): void {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.render(), REGENERATE_DEBOUNCE_MS);
  }

  /** Repaints with the current theme; a newer slider change cancels a paint in progress. */
  private async render(): Promise<void> {
    if (!this.generator || !this.texture) return;
    this.running?.abort();
    const controller = new AbortController();
    this.running = controller;
    const started = performance.now();
    try {
      await this.generator.render(this.canvas, this.layout, this.theme.current, {
        signal: controller.signal,
      });
      this.texture.refresh();
      this.report({ ...this.current, renderMs: performance.now() - started });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('[map] could not repaint the map', error);
    }
  }

  private report(timings: MapTimings): void {
    this.current = timings;
    console.info(
      `[map] ${this.size}px · analysis ${Math.round(timings.analysisMs)} ms · paint ${Math.round(timings.renderMs)} ms`,
    );
    this.listeners.forEach((listener) => listener(timings));
  }
}
