import { gatesOf, type MapLayout } from './layout';
import { extractGoldMask, glitterNoise, rotatedCopies, type Mask, type Pixels } from './goldVeins';
import type { MapTheme } from './theme';

export type TextureImage = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export interface MapTextures {
  readonly floor: TextureImage;
  readonly wall: TextureImage;
  readonly marble: TextureImage;
}

export interface RenderOptions {
  readonly signal?: AbortSignal;
  /** Fraction done, 0–1. */
  readonly onProgress?: (fraction: number) => void;
}

type Rgb = readonly [number, number, number];

const BACKGROUND: Rgb = [0x2b / 255, 0x2a / 255, 0x2c / 255];
const LINE_GOLD = 'rgb(222, 180, 70)';
const ENTRANCE_FILL = 'rgb(40, 36, 42)';
/** The reference was drawn at 1600 px; strokes and texture scales are tuned for it. */
const REFERENCE_SIZE = 1600;
/** Reference wall: a 700 px stone texture, with 120 px of it across the wall thickness. */
const WALL_TEXTURE_SPAN = 700;
const WALL_TEXTURE_DEPTH = 120;
const FLOOR_BRIGHTNESS = 1.05;
/** Blue tint of the disc: grayscale marble times this, plus the offset. */
const DISC_TINT: Rgb = [0.55 * 1.25, 0.62 * 1.25, 1.35 * 1.25];
const DISC_OFFSET: Rgb = [0.06, 0.07, 0.16];
const SHADOW_WIDTH = 0.03;
const ROWS_PER_CHUNK = 96;

/**
 * Builds the static layers of the map (floor, veins, wall, blue disc, inner
 * shadow and gold lines) into a canvas. The heavy texture analysis is done
 * once in `create`; `render` can then be re-run cheaply when the theme changes.
 */
export class MapGenerator {
  private constructor(
    readonly size: number,
    private readonly textures: MapTextures,
    private readonly sources: Sources,
  ) {}

  static async create(
    textures: MapTextures,
    size: number,
    options: RenderOptions = {},
  ): Promise<MapGenerator> {
    const report = options.onProgress ?? (() => undefined);
    const marble = readPixels(size, (ctx) => ctx.drawImage(textures.marble, 0, 0, size, size));
    await pause(options.signal);
    const baseVeins = extractGoldMask(marble);
    report(0.2);
    await pause(options.signal);
    const extraVeins = rotatedCopies(baseVeins);
    report(0.4);
    await pause(options.signal);
    const sources: Sources = {
      marbleGray: grayscale(marble),
      baseVeins,
      extraVeins,
      noise: glitterNoise(size * size),
      wall: readTexture(textures.wall),
    };
    report(0.5);
    return new MapGenerator(size, textures, sources);
  }

  /** Paints the map into `target` (resized to the map size). Rejects with AbortError when cancelled. */
  async render(
    target: HTMLCanvasElement,
    layout: MapLayout,
    theme: MapTheme,
    options: RenderOptions = {},
  ): Promise<void> {
    const { size } = this;
    const floor = readPixels(size, (ctx) => drawFloor(ctx, this.textures.floor, size, theme));
    const image = new ImageData(size, size);
    const paint = pixelPainter({ size, layout, theme, sources: this.sources, floor });
    for (let y0 = 0; y0 < size; y0 += ROWS_PER_CHUNK) {
      await pause(options.signal);
      for (let y = y0; y < Math.min(size, y0 + ROWS_PER_CHUNK); y++) paint(image.data, y);
      options.onProgress?.(y0 / size);
    }
    target.width = size;
    target.height = size;
    const ctx = context2d(target);
    ctx.putImageData(image, 0, 0);
    drawEntrances(ctx, layout, size);
    drawGoldLines(ctx, layout, size);
    options.onProgress?.(1);
  }
}

interface Sources {
  /** Grayscale marble, 0–1, for the blue disc. */
  readonly marbleGray: Float32Array;
  readonly baseVeins: Mask;
  readonly extraVeins: Mask;
  readonly noise: Float32Array;
  readonly wall: Pixels;
}

interface PainterInput {
  readonly size: number;
  readonly layout: MapLayout;
  readonly theme: MapTheme;
  readonly sources: Sources;
  readonly floor: Pixels;
}

/** Returns a function that paints one row of the map; constants are resolved once here. */
function pixelPainter({ size, layout, theme, sources, floor }: PainterInput) {
  const wallOut = layout.wall.outerRadius;
  const wallIn = wallOut - layout.wall.thickness;
  const disc = layout.innerDisc.radius;
  const gold = hexToRgb(theme.goldColor);
  const discTint = hueRotate(DISC_TINT, theme.discHueShift).map((v) => v * theme.discBrightness);
  const discOffset = hueRotate(DISC_OFFSET, theme.discHueShift);
  const wallTone: Rgb = [
    1 + 0.02 * theme.wallWarmth,
    1 - 0.02 * theme.wallWarmth,
    1 - 0.07 * theme.wallWarmth,
  ];
  const wallSampler = polarWallSampler(sources.wall, {
    size,
    wallIn,
    thickness: layout.wall.thickness,
  });
  const { baseVeins, extraVeins, noise, marbleGray } = sources;
  const center = size / 2;
  const out: [number, number, number] = [0, 0, 0];

  return (data: Uint8ClampedArray, y: number): void => {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      const radius = Math.hypot(dx, dy) / size;
      const vein = Math.max(
        baseVeins.values[i] ?? 0,
        (extraVeins.values[i] ?? 0) * theme.veinCopies,
      );
      const sparkle = 0.75 + 0.5 * (noise[i] ?? 0);

      if (radius > wallOut) {
        out[0] = BACKGROUND[0];
        out[1] = BACKGROUND[1];
        out[2] = BACKGROUND[2];
      } else if (radius > wallIn) {
        wallSampler(dx, dy, radius, out);
        const gray = (out[0] + out[1] + out[2]) / 3;
        for (let c = 0; c < 3; c++) {
          const stone =
            gray * (wallTone[c] ?? 1) * theme.wallDesaturation +
            (out[c] ?? 0) * (1 - theme.wallDesaturation);
          out[c] = mix(stone, (gold[c] ?? 0) * sparkle, vein * theme.wallVeins);
        }
      } else if (radius <= disc) {
        const gray = marbleGray[i] ?? 0;
        for (let c = 0; c < 3; c++) {
          const blue = gray * (discTint[c] ?? 0) + (discOffset[c] ?? 0);
          out[c] = mix(blue, (gold[c] ?? 0) * sparkle, vein);
        }
      } else {
        const p = i * 4;
        for (let c = 0; c < 3; c++) {
          const tile = ((floor.data[p + c] ?? 0) / 255) * FLOOR_BRIGHTNESS;
          out[c] = mix(tile, (gold[c] ?? 0) * sparkle, vein * theme.floorVeins);
        }
      }

      if (radius <= wallIn) {
        const nearWall = clamp01((radius - (wallIn - SHADOW_WIDTH)) / SHADOW_WIDTH);
        const shade = 1 - nearWall * theme.innerShadow;
        out[0] *= shade;
        out[1] *= shade;
        out[2] *= shade;
      }

      const p = i * 4;
      data[p] = out[0] * 255;
      data[p + 1] = out[1] * 255;
      data[p + 2] = out[2] * 255;
      data[p + 3] = 255;
    }
  };
}

/**
 * Stone texture laid along the ring: u follows the arc length, v the depth of
 * the wall, so the stones curve with the wall instead of being cut by it.
 */
function polarWallSampler(
  wall: Pixels,
  { size, wallIn, thickness }: { size: number; wallIn: number; thickness: number },
) {
  const texelsPerPixel = (wall.width / WALL_TEXTURE_SPAN) * (REFERENCE_SIZE / size);
  const midRadiusPx = (wallIn + thickness / 2) * size;
  const depthTexels = (WALL_TEXTURE_DEPTH / WALL_TEXTURE_SPAN) * wall.height;

  return (dx: number, dy: number, radius: number, out: [number, number, number]): void => {
    // Measured from North like the layout, so the texture seam hides under the North gate.
    const turn = Math.atan2(dx, -dy);
    const angle = turn < 0 ? turn + 2 * Math.PI : turn;
    const u = Math.floor(angle * midRadiusPx * texelsPerPixel) % wall.width;
    const v = Math.floor(((radius - wallIn) / thickness) * depthTexels) % wall.height;
    const p = (v * wall.width + u) * 4;
    out[0] = (wall.data[p] ?? 0) / 255;
    out[1] = (wall.data[p + 1] ?? 0) / 255;
    out[2] = (wall.data[p + 2] ?? 0) / 255;
  };
}

function drawFloor(
  ctx: CanvasRenderingContext2D,
  floor: TextureImage,
  size: number,
  theme: MapTheme,
): void {
  const tile = Math.max(1, Math.round(size * theme.floorScale));
  for (let y = 0; y < size; y += tile) {
    for (let x = 0; x < size; x += tile) ctx.drawImage(floor, x, y, tile, tile);
  }
}

/** Dark gaps in the wall under each gate, as in the reference; the gate sprites cover them. */
function drawEntrances(ctx: CanvasRenderingContext2D, layout: MapLayout, size: number): void {
  const outer = layout.wall.outerRadius + 0.004;
  const inner = layout.wall.outerRadius - layout.wall.thickness - 0.004;
  const halfSpan = (layout.entrances.width / 2 / inner) * (180 / Math.PI);
  const at = (radius: number, angle: number): [number, number] => {
    const a = (angle * Math.PI) / 180;
    return [(0.5 + radius * Math.sin(a)) * size, (0.5 - radius * Math.cos(a)) * size];
  };
  ctx.fillStyle = ENTRANCE_FILL;
  ctx.strokeStyle = LINE_GOLD;
  ctx.lineWidth = scaledStroke(size, 1);
  for (const { angle } of gatesOf(layout)) {
    ctx.beginPath();
    ctx.moveTo(...at(outer, angle - halfSpan));
    ctx.lineTo(...at(outer, angle + halfSpan));
    ctx.lineTo(...at(inner, angle + halfSpan));
    ctx.lineTo(...at(inner, angle - halfSpan));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawGoldLines(ctx: CanvasRenderingContext2D, layout: MapLayout, size: number): void {
  const wallOut = layout.wall.outerRadius;
  const circles: [number, number][] = [
    [wallOut, 4],
    [wallOut - layout.wall.thickness, 4],
    [layout.innerDisc.radius, 5],
    [layout.core.radius, 5],
  ];
  ctx.strokeStyle = LINE_GOLD;
  for (const [radius, width] of circles) {
    ctx.lineWidth = scaledStroke(size, width);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, radius * size, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function scaledStroke(size: number, referenceWidth: number): number {
  return Math.max(1, (referenceWidth * size) / REFERENCE_SIZE);
}

/** Hue rotation matrix (as in CSS hue-rotate) applied to a color vector. */
export function hueRotate([r, g, b]: Rgb, degrees: number): Rgb {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [
    r * (0.213 + cos * 0.787 - sin * 0.213) +
      g * (0.715 - cos * 0.715 - sin * 0.715) +
      b * (0.072 - cos * 0.072 + sin * 0.928),
    r * (0.213 - cos * 0.213 + sin * 0.143) +
      g * (0.715 + cos * 0.285 + sin * 0.14) +
      b * (0.072 - cos * 0.072 - sin * 0.283),
    r * (0.213 - cos * 0.213 - sin * 0.787) +
      g * (0.715 - cos * 0.715 + sin * 0.715) +
      b * (0.072 + cos * 0.928 + sin * 0.072),
  ];
}

export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function grayscale(pixels: Pixels): Float32Array {
  return Float32Array.from({ length: pixels.width * pixels.height }, (_, i) => {
    const p = i * 4;
    return ((pixels.data[p] ?? 0) + (pixels.data[p + 1] ?? 0) + (pixels.data[p + 2] ?? 0)) / 765;
  });
}

function readTexture(source: TextureImage): Pixels {
  const { width, height } = sourceSize(source);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = context2d(canvas);
  ctx.drawImage(source, 0, 0);
  return ctx.getImageData(0, 0, width, height);
}

function readPixels(size: number, draw: (ctx: CanvasRenderingContext2D) => void): Pixels {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = context2d(canvas);
  draw(ctx);
  return ctx.getImageData(0, 0, size, size);
}

function sourceSize(source: TextureImage): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2D context unavailable');
  return ctx;
}

/**
 * Lets the browser paint the loading screen between chunks, and honors cancellation.
 * A MessageChannel task instead of setTimeout: background tabs throttle timers
 * to one per second or slower, which would stretch generation to minutes.
 */
function pause(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('map render cancelled', 'AbortError'));
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
