import type { PlotDef, PlotType } from '../../model/schema';
import type { PlotView } from './gardenViews';

/** Sprites and textures of the garden scene (public/assets/garden), loaded only by the HTML window. */
export const GARDEN_ART_DIR = 'assets/garden';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Crops are made by the master and have no art: the look comes from a hash of the seed id. */
export interface CropLook {
  kind: 'foliage' | 'flower';
  /** Degrees for `hue-rotate` on the flower sprites. */
  hue: number;
}

/** FNV-1a: the same seed id gives the same look on every device and in every session. */
function hash(text: string): number {
  const mixed = [...text].reduce(
    (h, char) => Math.imul(h ^ (char.codePointAt(0) ?? 0), 0x01000193),
    0x811c9dc5,
  );
  return mixed >>> 0;
}

export function cropLook(seedId: string): CropLook {
  const h = hash(seedId);
  return { kind: h % 2 === 0 ? 'foliage' : 'flower', hue: ((h >>> 8) % 360) - 180 };
}

export type PlantStage = 'seeded' | 'sprout' | 'young' | 'grown' | 'ready';

const GROWING_STAGES: readonly { below: number; stage: PlantStage }[] = [
  { below: Number.EPSILON, stage: 'seeded' },
  { below: 0.34, stage: 'sprout' },
  { below: 0.67, stage: 'young' },
];

/** Undefined for an empty plot. */
export function plantStage(view: PlotView): PlantStage | undefined {
  switch (view.kind) {
    case 'empty':
      return undefined;
    case 'ready':
      return 'ready';
    case 'growing':
      return GROWING_STAGES.find(({ below }) => view.progress < below)?.stage ?? 'grown';
  }
}

/** Where a plant stands in its plot: center in % of the plot, size in % of its width. */
export interface PlantSpot {
  x: number;
  y: number;
  size: number;
}

const CANTEIRO_SPOTS: readonly PlantSpot[] = [0, 1].flatMap((row) =>
  [0, 1, 2, 3].map((column) => ({ x: 17 + column * 22, y: 32 + row * 36, size: 27 })),
);

const SPOTS: Record<PlotType, readonly PlantSpot[]> = {
  canteiro: CANTEIRO_SPOTS,
  muda: [{ x: 50, y: 50, size: 64 }],
  // One per pot: a tray holds two.
  estufa: [
    { x: 27, y: 50, size: 38 },
    { x: 73, y: 50, size: 38 },
  ],
  arcana: [{ x: 50, y: 50, size: 62 }],
  lago: [
    { x: 36, y: 40, size: 34 },
    { x: 64, y: 44, size: 30 },
    { x: 46, y: 66, size: 28 },
  ],
};

export function plantSpots(type: PlotType): readonly PlantSpot[] {
  return SPOTS[type];
}

export type PlantSprite = `${'leaf' | 'flower'}${0 | 1 | 2 | 3 | 4 | 5}`;
/** `bud`: flower not open yet (washed out); `bloom` and `lush`: ready. */
export type TuftTone = 'plain' | 'bud' | 'bloom' | 'lush';

export type Tuft =
  | { kind: 'mound'; spot: PlantSpot }
  | {
      kind: 'plant';
      spot: PlantSpot;
      sprite: PlantSprite;
      tone: TuftTone;
      scale: number;
      rotation: number;
      /** Seconds, negative so neighbours sway out of step from the first frame. */
      delay: number;
    };

const LEAVES = ['leaf0', 'leaf1', 'leaf2'] as const;
const SPROUTS = ['leaf3', 'leaf4', 'leaf5'] as const;
const FLOWERS = ['flower2', 'flower3', 'flower4', 'flower5'] as const;

interface SpritePick {
  sprite: PlantSprite;
  tone: TuftTone;
  scale: number;
}

function pickSprite(stage: Exclude<PlantStage, 'seeded'>, look: CropLook, i: number): SpritePick {
  const leaf = LEAVES[i % LEAVES.length] ?? 'leaf0';
  const flower = FLOWERS[i % FLOWERS.length] ?? 'flower2';
  const isFlower = look.kind === 'flower';
  switch (stage) {
    case 'sprout':
      return { sprite: SPROUTS[i % SPROUTS.length] ?? 'leaf3', tone: 'plain', scale: 0.45 };
    case 'young':
      return { sprite: leaf, tone: 'plain', scale: 0.72 };
    case 'grown':
      return isFlower
        ? { sprite: flower, tone: 'bud', scale: 0.82 }
        : { sprite: leaf, tone: 'plain', scale: 0.9 };
    case 'ready':
      return isFlower
        ? { sprite: flower, tone: 'bloom', scale: 1 }
        : { sprite: leaf, tone: 'lush', scale: 1.08 };
  }
}

export function plantTufts(type: PlotType, stage: PlantStage, look: CropLook): Tuft[] {
  return plantSpots(type).map((spot, i) =>
    stage === 'seeded'
      ? { kind: 'mound', spot }
      : {
          kind: 'plant',
          spot,
          ...pickSprite(stage, look, i),
          rotation: ((i * 73) % 60) - 30,
          delay: -((i * 0.37) % 2),
        },
  );
}

/** What changes a plot's drawing: equal signatures leave the plot alone (and its animations running). */
export function plotSignature(view: PlotView): string {
  switch (view.kind) {
    case 'empty':
      return 'empty';
    case 'ready':
      return `ready|${view.crop.seedId}|${view.crop.yield}|${view.harvestName}`;
    case 'growing':
      return `growing|${view.crop.seedId}|${view.daysLeft}|${Math.round(view.progress * 100)}|${view.harvestName}`;
  }
}

export interface Size {
  width: number;
  height: number;
}

const POPOVER_MARGIN = 8;
const POPOVER_GAP_ABOVE = 14;
const POPOVER_GAP_BELOW = 18;

/** Pixels inside the scene: centered above the plot, below it when there is no room, always inside. */
export function popoverPosition(
  plot: Rect,
  scene: Size,
  popover: Size,
): { left: number; top: number } {
  const clamp = (value: number, max: number) =>
    Math.max(POPOVER_MARGIN, Math.min(max - POPOVER_MARGIN, value));
  const centered = (plot.x + plot.w / 2) * scene.width - popover.width / 2;
  const above = plot.y * scene.height - popover.height - POPOVER_GAP_ABOVE;
  const below = (plot.y + plot.h) * scene.height + POPOVER_GAP_BELOW;
  return {
    left: clamp(centered, scene.width - popover.width),
    top: clamp(above < POPOVER_MARGIN ? below : above, scene.height - popover.height),
  };
}

type Side = 'left' | 'right';

/** Benches and the pond corner, in scene fractions; the plots in garden.json sit on them. */
const BENCHES: Record<Side, Rect> = {
  left: { x: 0.05, y: 0.07, w: 0.4, h: 0.135 },
  right: { x: 0.55, y: 0.07, w: 0.4, h: 0.135 },
};
const POND_AREA: Rect = { x: 0.64, y: 0.7, w: 0.3, h: 0.21 };

export type LockedArea = 'greenhouse' | 'ponds' | 'plot';

export type SceneryPiece =
  | { kind: 'bench'; style: 'estufa' | 'arcana'; box: Rect }
  | { kind: 'locked'; area: LockedArea; level: number; box: Rect };

const BENCH_TYPES = ['estufa', 'arcana'] as const satisfies readonly PlotType[];

const isOpenGround = (type: PlotType) => type === 'canteiro' || type === 'muda';

const sideOf = (plot: PlotDef): Side => (plot.x + plot.w / 2 < 0.5 ? 'left' : 'right');

interface LaterLevel {
  level: number;
  plots: readonly PlotDef[];
}

/**
 * Scenery behind the plots of `level` (1-based; 0 = not built): its benches,
 * and dashed outlines of what later levels add.
 */
export function gardenScenery(
  levels: readonly (readonly PlotDef[])[],
  level: number,
): SceneryPiece[] {
  const inForce = levels[level - 1] ?? [];
  const later = levels.slice(level).map((plots, i) => ({ level: level + 1 + i, plots }));
  return [...benches(inForce, later), ...ponds(inForce, later), ...lockedPlots(inForce, later)];
}

function firstLevelWith(later: readonly LaterLevel[], match: (plot: PlotDef) => boolean) {
  return later.find(({ plots }) => plots.some(match))?.level;
}

/** The first bench still to come reads "Estufa · Nível N", the other just the level. */
function benches(inForce: readonly PlotDef[], later: readonly LaterLevel[]): SceneryPiece[] {
  return (['left', 'right'] as const).flatMap((side, i): SceneryPiece[] => {
    const onSide = (type: PlotType) => (plot: PlotDef) =>
      plot.type === type && sideOf(plot) === side;
    const style = BENCH_TYPES.find((type) => inForce.some(onSide(type)));
    if (style) return [{ kind: 'bench', style, box: BENCHES[side] }];
    const unlocks = firstLevelWith(later, (plot) => BENCH_TYPES.some((type) => onSide(type)(plot)));
    const area: LockedArea = i === 0 ? 'greenhouse' : 'plot';
    return unlocks ? [{ kind: 'locked', area, level: unlocks, box: BENCHES[side] }] : [];
  });
}

function ponds(inForce: readonly PlotDef[], later: readonly LaterLevel[]): SceneryPiece[] {
  if (inForce.some((plot) => plot.type === 'lago')) return [];
  const level = firstLevelWith(later, (plot) => plot.type === 'lago');
  return level ? [{ kind: 'locked', area: 'ponds', level, box: POND_AREA }] : [];
}

/** Canteiros and mudas of later levels, each at the first level that has it. */
function lockedPlots(inForce: readonly PlotDef[], later: readonly LaterLevel[]): SceneryPiece[] {
  const shown = new Set(inForce.map((plot) => plot.id));
  const upcoming = later
    .flatMap(({ level, plots }) => plots.map((plot) => ({ level, plot })))
    .filter(({ plot }) => isOpenGround(plot.type) && !shown.has(plot.id));
  return upcoming
    .filter(({ plot }, i) => upcoming.findIndex((other) => other.plot.id === plot.id) === i)
    .map(({ level, plot: { x, y, w, h } }) => ({
      kind: 'locked',
      area: 'plot',
      level,
      box: { x, y, w, h },
    }));
}
