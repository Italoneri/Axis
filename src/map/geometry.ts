import type { ArcShape, SlotDef } from './layout';

/** Normalized map coordinates: (0, 0) top-left, (1, 1) bottom-right, center at (0.5, 0.5). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Polar {
  readonly radius: number;
  /** Degrees in [0, 360): 0 = North, clockwise. */
  readonly angle: number;
}

export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export const CENTER: Point = { x: 0.5, y: 0.5 };

/**
 * The reference render draws the middle squares axis-aligned; their `angle` in
 * layout.json is only their position on the ring.
 */
const SQUARE_ROTATION = 0;
/** Share of the slot a building sprite may fill, leaving the foundation edge visible. */
const SPRITE_FILL = 0.92;
const ARC_STEPS = 32;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function normalizeAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function polarToPoint({ radius, angle }: Polar): Point {
  const a = toRadians(angle);
  return { x: CENTER.x + radius * Math.sin(a), y: CENTER.y - radius * Math.cos(a) };
}

export function pointToPolar({ x, y }: Point): Polar {
  const dx = x - CENTER.x;
  const dy = y - CENTER.y;
  return {
    radius: Math.hypot(dx, dy),
    angle: normalizeAngle((Math.atan2(dx, -dy) * 180) / Math.PI),
  };
}

export function toPixels({ x, y }: Point, mapSize: number): Point {
  return { x: x * mapSize, y: y * mapSize };
}

export function toNormalized({ x, y }: Point, mapSize: number): Point {
  return { x: x / mapSize, y: y / mapSize };
}

/** Clockwise from `start` to `end`; a range like 350° → 10° wraps through North. */
export function isAngleWithin(angle: number, start: number, end: number): boolean {
  const span = normalizeAngle(end - start);
  return normalizeAngle(angle - start) <= span;
}

export function isInsideArc(point: Point, arc: ArcShape): boolean {
  const { radius, angle } = pointToPolar(point);
  if (radius < arc.innerRadius || radius > arc.outerRadius) return false;
  return isAngleWithin(angle, arc.startAngle, arc.endAngle);
}

export function isInsideCircle(point: Point, center: Point, radius: number): boolean {
  return Math.hypot(point.x - center.x, point.y - center.y) <= radius;
}

/** Ray casting: counts how many edges a horizontal ray from the point crosses. */
export function isInsidePolygon(point: Point, polygon: readonly Point[]): boolean {
  return polygon.reduce((inside, a, i) => {
    const b = polygon[(i + polygon.length - 1) % polygon.length] ?? a;
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    return crosses ? !inside : inside;
  }, false);
}

/** Corners of a square of side `size` centered on `center`, turned clockwise by `rotation` degrees. */
export function squareCorners(center: Point, size: number, rotation: number): Point[] {
  const half = size / 2;
  const a = toRadians(rotation);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ].map(([dx = 0, dy = 0]) => ({
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  }));
}

/** Closed outline of an annular sector: the outer edge clockwise, then the inner edge back. */
export function arcOutline(arc: ArcShape, steps = ARC_STEPS): Point[] {
  const span = normalizeAngle(arc.endAngle - arc.startAngle);
  const angles = Array.from({ length: steps + 1 }, (_, i) => arc.startAngle + (span * i) / steps);
  return [
    ...angles.map((angle) => polarToPoint({ radius: arc.outerRadius, angle })),
    ...[...angles].reverse().map((angle) => polarToPoint({ radius: arc.innerRadius, angle })),
  ];
}

export function slotContains(slot: SlotDef, point: Point): boolean {
  switch (slot.shape) {
    case 'round':
      return isInsideCircle(point, slot, slot.size / 2);
    case 'square':
      return isInsidePolygon(point, squareCorners(slot, slot.size, SQUARE_ROTATION));
    case 'arc':
      return isInsideArc(point, slot.arc);
  }
}

/** Polygon drawn as the slot's foundation; the core is a circle and has none. */
export function slotOutline(slot: SlotDef): Point[] {
  switch (slot.shape) {
    case 'round':
      return [];
    case 'square':
      return squareCorners(slot, slot.size, SQUARE_ROTATION);
    case 'arc':
      return arcOutline(slot.arc);
  }
}

export function slotBounds(slot: SlotDef): Bounds {
  if (slot.shape === 'round') {
    return { left: slot.x - slot.size / 2, top: slot.y - slot.size / 2, ...square(slot.size) };
  }
  const points = slotOutline(slot);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

/** Side of the square a building sprite gets, centered on the slot's (x, y). */
export function slotSpriteSize(slot: SlotDef): number {
  switch (slot.shape) {
    case 'round':
    case 'square':
      return slot.size * SPRITE_FILL;
    case 'arc':
      return arcSpriteSize(slot.arc);
  }
}

/** Arc depth or chord at mid radius, whichever is shorter, so the sprite stays inside. */
function arcSpriteSize(arc: ArcShape): number {
  const depth = arc.outerRadius - arc.innerRadius;
  const midRadius = (arc.innerRadius + arc.outerRadius) / 2;
  const span = toRadians(normalizeAngle(arc.endAngle - arc.startAngle));
  const chord = 2 * midRadius * Math.sin(span / 2);
  return Math.min(depth, chord) * SPRITE_FILL;
}

/** True when the clockwise ranges [aStart, aEnd] and [bStart, bEnd] share any angle. */
export function angleRangesOverlap(
  [aStart, aEnd]: readonly [number, number],
  [bStart, bEnd]: readonly [number, number],
): boolean {
  return isAngleWithin(bStart, aStart, aEnd) || isAngleWithin(aStart, bStart, bEnd);
}

function square(size: number): { width: number; height: number } {
  return { width: size, height: size };
}
