import Phaser from 'phaser';
import { polarToPoint, toPixels } from './geometry';
import { gatesOf, type Gate, type MapLayout, type Rgb } from './layout';
import { context2d, type TextureImage } from './mapGenerator';
import type { MapTheme } from './theme';

export type GateState = 'idle' | 'active' | 'off';

/** Sizes in the 1600 px reference drawing, scaled to the map size. */
const REFERENCE_SIZE = 1600;
const PILLAR_WIDTH = 26;
const GATE_OVERHANG = 22;
const LEAF_INSET = 14;
const SHADOW_OFFSET = 4;
const SHADOW_BLUR = 8;
const GOLD = 'rgb(226, 184, 74)';
const GOLD_DARK = 'rgb(140, 104, 34)';
const SETTING_FILL = 'rgb(28, 24, 30)';
const PILLAR_STONE: Rgb = [120, 112, 104];
/** Facet lighting, from the top facet clockwise: light comes from the top left. */
const FACET_SHADES = [0.55, 0.3, -0.1, -0.35, -0.2, 0.25];
const OFF_TINT = 0x4a4650;
const BASE_PERIOD_MS = 2000;

const DEPTH = { shadow: 18, body: 19, halo: 20, prism: 21 };

/** How bright and wide the halo breathes in each state, as fractions of `prismGlow`. */
const STATE_GLOW: Record<
  GateState,
  { alpha: [number, number]; scale: [number, number]; speed: number }
> = {
  idle: { alpha: [0.45, 1], scale: [0.9, 1.1], speed: 1 },
  active: { alpha: [0.85, 1.25], scale: [1.15, 1.45], speed: 2.2 },
  off: { alpha: [0, 0], scale: [1, 1], speed: 1 },
};

interface GateView {
  readonly gate: Gate;
  readonly halo: Phaser.GameObjects.Image;
  readonly prism: Phaser.GameObjects.Image;
  readonly pulse: Phaser.Tweens.Tween;
  readonly breath: { t: number };
  state: GateState;
}

export interface GatesOptions {
  readonly layout: MapLayout;
  readonly mapSize: number;
  readonly theme: MapTheme;
  readonly stone: TextureImage;
  readonly floor: TextureImage;
}

/**
 * The eight gates, drawn by code from layout.json: stone pillars, black marble
 * leaves and a prism in the gate's color, with a slowly pulsing halo.
 */
export class Gates {
  private readonly views = new Map<string, GateView>();
  private theme: MapTheme;

  constructor(
    private readonly scene: Phaser.Scene,
    { layout, mapSize, theme, stone, floor }: GatesOptions,
  ) {
    this.theme = theme;
    const metrics = gateMetrics(layout, mapSize);
    const keys = createGateTextures(scene.textures, { layout, metrics, stone, floor });
    const midRadius = layout.wall.outerRadius - layout.wall.thickness / 2;
    gatesOf(layout).forEach((gate, index) => {
      const { x, y } = toPixels(polarToPoint({ radius: midRadius, angle: gate.angle }), mapSize);
      const rotation = Phaser.Math.DegToRad(gate.angle);
      const offset = metrics.scale * SHADOW_OFFSET;
      scene.add
        .image(x + offset, y + offset, keys.shadow)
        .setRotation(rotation)
        .setDepth(DEPTH.shadow);
      scene.add.image(x, y, keys.body).setRotation(rotation).setDepth(DEPTH.body);
      const halo = scene.add
        .image(x, y, keys.halo)
        .setTint(toHex(gate.prism.glow ?? gate.prism.rgb))
        .setDepth(DEPTH.halo);
      const prism = scene.add
        .image(x, y, keys.prism(gate.prism.id))
        .setRotation(rotation)
        .setDepth(DEPTH.prism);
      const breath = { t: 0 };
      const view: GateView = {
        gate,
        halo,
        prism,
        breath,
        state: 'idle',
        pulse: this.pulse(breath, index),
      };
      view.pulse.on('update', () => this.applyBreath(view));
      this.views.set(gate.prism.id, view);
      this.applyBreath(view);
    });
  }

  get gateIds(): string[] {
    return [...this.views.keys()];
  }

  /** Changes how a gate glows: `idle` breathes slowly, `active` flares, `off` goes dark. */
  setGateState(gateId: string, state: GateState): void {
    const view = this.views.get(gateId);
    if (!view) {
      console.warn('[gates] unknown gate', gateId);
      return;
    }
    view.state = state;
    view.pulse.timeScale = this.pulseSpeed(state);
    view.halo.setVisible(state !== 'off');
    if (state === 'off') view.prism.setTint(OFF_TINT);
    else view.prism.clearTint();
    this.applyBreath(view);
  }

  setTheme(theme: MapTheme): void {
    this.theme = theme;
    this.views.forEach((view) => {
      view.pulse.timeScale = this.pulseSpeed(view.state);
      this.applyBreath(view);
    });
  }

  /** One breath every BASE_PERIOD_MS at timeScale 1; each gate starts at its own phase. */
  private pulse(breath: { t: number }, index: number): Phaser.Tweens.Tween {
    const tween = this.scene.tweens.add({
      targets: breath,
      t: 1,
      duration: BASE_PERIOD_MS / 2,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
      delay: (index * BASE_PERIOD_MS) / 8,
    });
    tween.timeScale = this.pulseSpeed('idle');
    return tween;
  }

  private pulseSpeed(state: GateState): number {
    return (BASE_PERIOD_MS / 1000 / this.theme.prismPulseSeconds) * STATE_GLOW[state].speed;
  }

  private applyBreath({ halo, breath, state }: GateView): void {
    const { alpha, scale } = STATE_GLOW[state];
    const glow = this.theme.prismGlow;
    halo.setAlpha(Math.min(1, lerp(alpha[0], alpha[1], breath.t) * glow));
    halo.setScale(lerp(scale[0], scale[1], breath.t));
  }
}

interface GateMetrics {
  readonly scale: number;
  readonly door: number;
  readonly pillar: number;
  readonly width: number;
  readonly height: number;
  readonly leafTop: number;
  readonly leafBottom: number;
  readonly prismRadius: number;
}

function gateMetrics(layout: MapLayout, mapSize: number): GateMetrics {
  const scale = mapSize / REFERENCE_SIZE;
  const door = layout.entrances.width * mapSize;
  const pillar = PILLAR_WIDTH * scale;
  const height = layout.wall.thickness * mapSize + GATE_OVERHANG * scale;
  const leafTop = LEAF_INSET * scale;
  const leafBottom = height - LEAF_INSET * scale;
  return {
    scale,
    door,
    pillar,
    width: door + 2 * pillar,
    height,
    leafTop,
    leafBottom,
    prismRadius: Math.min(door, leafBottom - leafTop) * 0.34,
  };
}

interface TextureInput {
  readonly layout: MapLayout;
  readonly metrics: GateMetrics;
  readonly stone: TextureImage;
  readonly floor: TextureImage;
}

/** Registers (or replaces) the gate textures; prisms get one texture per color. */
function createGateTextures(
  textures: Phaser.Textures.TextureManager,
  { layout, metrics, stone, floor }: TextureInput,
) {
  const body = drawBody(metrics, { stone, floor });
  const keys = {
    body: 'gate.body',
    shadow: 'gate.shadow',
    halo: 'gate.halo',
    prism: (id: string) => `gate.prism.${id}`,
  };
  register(textures, keys.body, body);
  register(textures, keys.shadow, drawShadow(body, metrics.scale));
  register(textures, keys.halo, drawHalo(metrics.prismRadius));
  for (const { prism } of gatesOf(layout)) {
    register(textures, keys.prism(prism.id), drawPrism(prism, metrics.prismRadius));
  }
  return keys;
}

function register(
  textures: Phaser.Textures.TextureManager,
  key: string,
  canvas: HTMLCanvasElement,
) {
  if (textures.exists(key)) textures.remove(key);
  textures.addCanvas(key, canvas);
}

function drawBody(m: GateMetrics, { stone, floor }: { stone: TextureImage; floor: TextureImage }) {
  const { canvas, ctx } = newCanvas(m.width, m.height);
  const line = (width: number) => Math.max(1, width * m.scale);

  // Leaves: darkened black marble with a gold frame, center seam and two braces.
  const leafHeight = m.leafBottom - m.leafTop;
  ctx.drawImage(
    floor,
    0,
    0,
    sideOf(floor) / 5,
    sideOf(floor) / 5,
    m.pillar,
    m.leafTop,
    m.door,
    leafHeight,
  );
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(m.pillar, m.leafTop, m.door, leafHeight);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = line(3);
  ctx.strokeRect(m.pillar, m.leafTop, m.door, leafHeight);
  strokeLine(ctx, [m.width / 2, m.leafTop], [m.width / 2, m.leafBottom]);
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = line(2);
  for (const f of [0.3, 0.7]) {
    const y = m.leafTop + leafHeight * f;
    strokeLine(ctx, [m.pillar, y], [m.pillar + m.door, y]);
  }

  // Pillars: warm gray stone with a gold outline and a capstone.
  const pillar = pillarTexture(stone, m.pillar, m.height);
  for (const x of [0, m.width - m.pillar]) {
    ctx.drawImage(pillar, x, 0);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = line(3);
    ctx.strokeRect(x, 0, m.pillar, m.height);
    ctx.strokeStyle = GOLD_DARK;
    ctx.lineWidth = line(2);
    const inset = 5 * m.scale;
    ctx.strokeRect(x + inset, inset, m.pillar - 2 * inset, m.pillar - 2 * inset);
  }
  return canvas;
}

/** Grayscale stone, darkened and blended with a warm gray so it matches the wall. */
function pillarTexture(stone: TextureImage, width: number, height: number): HTMLCanvasElement {
  const { canvas, ctx } = newCanvas(width, height);
  const side = sideOf(stone);
  ctx.drawImage(
    stone,
    side * 0.15,
    side * 0.15,
    side * 0.15,
    side * 0.3,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  for (let p = 0; p < data.length; p += 4) {
    const gray = (((data[p] ?? 0) + (data[p + 1] ?? 0) + (data[p + 2] ?? 0)) / 3) * 0.75;
    for (let c = 0; c < 3; c++) data[p + c] = gray * 0.65 + (PILLAR_STONE[c] ?? 0) * 0.35;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** The body's silhouette, blurred: drawn far outside the canvas so only its shadow lands inside. */
function drawShadow(body: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const pad = Math.ceil(SHADOW_BLUR * 2 * scale);
  const { canvas, ctx } = newCanvas(body.width + 2 * pad, body.height + 2 * pad);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = SHADOW_BLUR * scale;
  ctx.shadowOffsetX = canvas.width;
  ctx.drawImage(body, pad - canvas.width, pad);
  return canvas;
}

/** White radial glow, tinted per gate at runtime. */
function drawHalo(prismRadius: number): HTMLCanvasElement {
  const radius = prismRadius * 2.4;
  const { canvas, ctx } = newCanvas(radius * 2, radius * 2);
  const center = canvas.width / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
  gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Hexagonal prism: gold setting, six shaded facets, a lighter table and a highlight. */
function drawPrism(prism: Gate['prism'], r: number): HTMLCanvasElement {
  const { canvas, ctx } = newCanvas(r * 2.6, r * 2.6);
  const c = canvas.width / 2;
  const base = prism.rgb;
  const edge = prism.edge ?? mixRgb(base, [255, 255, 255], 0.6);
  const hexagon = (radius: number) =>
    Array.from({ length: 6 }, (_, i): [number, number] => {
      const a = Phaser.Math.DegToRad(60 * i - 90);
      return [c + radius * Math.cos(a), c + radius * Math.sin(a)];
    });

  fillPolygon(ctx, hexagon(r * 1.18), SETTING_FILL);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.stroke();

  const corners = hexagon(r);
  corners.forEach((corner, i) => {
    const shade = FACET_SHADES[i] ?? 0;
    const color =
      shade > 0 ? mixRgb(base, [255, 255, 255], shade) : mixRgb(base, [0, 0, 0], -shade);
    fillPolygon(ctx, [[c, c], corner, corners[(i + 1) % 6] ?? corner], rgbCss(color));
  });
  fillPolygon(ctx, hexagon(r * 0.45), rgbCss(mixRgb(base, [255, 255, 255], 0.35)));
  ctx.strokeStyle = rgbCss(edge);
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.stroke();
  tracePolygon(ctx, corners);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
  ctx.beginPath();
  ctx.ellipse(c - r * 0.315, c - r * 0.485, r * 0.135, r * 0.135, 0, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function newCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return { canvas, ctx: context2d(canvas) };
}

function tracePolygon(ctx: CanvasRenderingContext2D, points: readonly [number, number][]) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

function fillPolygon(
  ctx: CanvasRenderingContext2D,
  points: readonly [number, number][],
  fill: string,
) {
  tracePolygon(ctx, points);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  [x1, y1]: [number, number],
  [x2, y2]: [number, number],
) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function sideOf(image: TextureImage): number {
  return image instanceof HTMLImageElement
    ? Math.min(image.naturalWidth, image.naturalHeight)
    : Math.min(image.width, image.height);
}

function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
  const channel = (a: number, b: number) => Math.round(a + (b - a) * amount);
  return [channel(from[0], to[0]), channel(from[1], to[1]), channel(from[2], to[2])];
}

function rgbCss([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function toHex([r, g, b]: Rgb): number {
  return (r << 16) | (g << 8) | b;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}
