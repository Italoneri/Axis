// How a mission scroll looks on the board: color, tilt, drop and torn edges all
// come from its id, so every redraw and every player sees the same board.

export const PAPERS = ['laranja', 'bege', 'roxo', 'amarelo'] as const;
export type Paper = (typeof PAPERS)[number];

export interface ScrollLook {
  paper: Paper;
  /** Degrees, between −3 and 3. */
  tiltDeg: number;
  /** Pixels the scroll hangs below its row, so the grid looks uneven. */
  dropPx: number;
  /** `clip-path` polygon with ragged left and right edges. */
  edge: string;
}

const MAX_TILT_DEG = 3;
const MAX_DROP_PX = 22;
const EDGE_STEPS = 14;
/** Deepest tear, in percent of the width. */
const MAX_TEAR = 3.2;

export function scrollLook(id: string): ScrollLook {
  const next = randomStream(hash(id));
  const paper = PAPERS[Math.floor(next() * PAPERS.length)] ?? 'bege';
  const tiltDeg = round((next() * 2 - 1) * MAX_TILT_DEG);
  const dropPx = Math.round(next() * MAX_DROP_PX);
  return { paper, tiltDeg, dropPx, edge: tornEdge(next) };
}

/** Down the right edge, then up the left one; top and bottom stay straight under the rolls. */
function tornEdge(next: () => number): string {
  const ys = Array.from({ length: EDGE_STEPS + 1 }, (_, i) => round((i / EDGE_STEPS) * 100));
  const right = ys.map((y) => `${round(100 - next() * MAX_TEAR)}% ${y}%`);
  const left = [...ys].reverse().map((y) => `${round(next() * MAX_TEAR)}% ${y}%`);
  return `polygon(${[...right, ...left].join(', ')})`;
}

/** FNV-1a: small, stable across runtimes, good enough to spread ids. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** Mulberry32: numbers in [0, 1) from a seed, the same sequence everywhere. */
function randomStream(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
