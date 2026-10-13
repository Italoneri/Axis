import {
  angleRangesOverlap,
  isAngleWithin,
  normalizeAngle,
  pointToPolar,
  polarToPoint,
  type Point,
  type Polar,
} from './geometry';
import type { MapLayout, SlotDef } from './layout';

// Where walking NPCs may go: a small graph of waypoints in polar coordinates.
// Every edge keeps either its angle (a radial passage) or its radius (a stretch
// of the corridor), so walking along it is a straight line in (radius, angle).

/** Walking a quarter of the corridor takes about this long. */
const QUARTER_CORRIDOR_SECONDS = 20;
/** Corridor waypoints closer than this (degrees) are merged. */
const SAME_ANGLE = 1e-6;

export type WalkNodeKind = 'corridor' | 'gap' | 'core_door' | 'door' | 'outside';

export interface WalkNode {
  readonly polar: Polar;
  readonly kind: WalkNodeKind;
  /** The building whose door this is. */
  readonly slotId?: string;
}

export interface WalkGraph {
  readonly nodes: readonly WalkNode[];
  readonly neighbors: readonly (readonly number[])[];
  /** Door nodes of each slot (the core has one per passage). */
  readonly doors: ReadonlyMap<string, readonly number[]>;
  /** Shortest walking distance between any two nodes (normalized units). */
  readonly distance: readonly (readonly number[])[];
  /** Next node on the shortest path from `i` to `j`; -1 when unreachable. */
  readonly nextHop: readonly (readonly number[])[];
  readonly corridorRadius: number;
  /** Normalized units per second. */
  readonly speed: number;
  /** Longest shortest path, which bounds any trip. */
  readonly longestTrip: number;
}

interface Radii {
  corridor: number;
  innerDisc: number;
  core: number;
  outside: number;
}

export function buildWalkGraph(layout: MapLayout): WalkGraph {
  const radii = radiiOf(layout);
  const isAllowed = (angle: number) =>
    !layout.reserved.some((r) => isAngleWithin(angle, r.startAngle, r.endAngle));
  const builder = new GraphBuilder();
  const corridorAt = new Map<number, number>();
  const corridorNode = (angle: number) => {
    const key = Math.round(normalizeAngle(angle) / SAME_ANGLE);
    const known = corridorAt.get(key);
    if (known !== undefined) return known;
    const id = builder.add({
      polar: { radius: radii.corridor, angle: normalizeAngle(angle) },
      kind: 'corridor',
    });
    corridorAt.set(key, id);
    return id;
  };

  const coreSlot = layout.slots.find((slot) => slot.type === 'core');
  middleGaps(layout)
    .filter(isAllowed)
    .forEach((angle) => {
      const gap = builder.add({ polar: { radius: radii.innerDisc, angle }, kind: 'gap' });
      builder.link(corridorNode(angle), gap);
      if (!coreSlot) return;
      const door = builder.add({
        polar: { radius: radii.core, angle },
        kind: 'core_door',
        slotId: coreSlot.id,
      });
      builder.link(gap, door);
    });

  layout.entrances.angles.filter(isAllowed).forEach((angle) => {
    const outside = builder.add({ polar: { radius: radii.outside, angle }, kind: 'outside' });
    builder.link(corridorNode(angle), outside);
  });

  layout.slots.forEach((slot) => {
    const door = doorOf(slot);
    if (!door || !isAllowed(door.angle)) return;
    const id = builder.add({ polar: door, kind: 'door', slotId: slot.id });
    builder.link(corridorNode(door.angle), id);
  });

  linkCorridor(builder, [...corridorAt.values()], (from, to) =>
    layout.reserved.every((r) => !angleRangesOverlap([from, to], [r.startAngle, r.endAngle])),
  );
  return builder.finish(radii.corridor);
}

/** Middle of the corridor between the middle ring and the outer ring, plus the inner rims. */
function radiiOf(layout: MapLayout): Radii {
  const arcs = (type: SlotDef['type']) =>
    layout.slots.flatMap((slot) => (slot.shape === 'arc' && slot.type === type ? [slot.arc] : []));
  const middleOuter = Math.max(...arcs('middle').map((arc) => arc.outerRadius));
  const outerInner = Math.min(...arcs('outer').map((arc) => arc.innerRadius));
  const wallOuter = layout.wall.outerRadius;
  return {
    corridor: (middleOuter + outerInner) / 2,
    innerDisc: layout.innerDisc.radius,
    core: layout.core.radius,
    outside: wallOuter + (0.5 - wallOuter) / 2,
  };
}

/** Angles at the middle of each opening between two neighboring middle buildings. */
function middleGaps(layout: MapLayout): number[] {
  const spans = layout.slots
    .flatMap((slot) => (slot.shape === 'arc' && slot.type === 'middle' ? [slot.arc] : []))
    .map((arc) => ({
      start: normalizeAngle(arc.startAngle),
      span: normalizeAngle(arc.endAngle - arc.startAngle),
    }))
    .sort((a, b) => a.start - b.start);
  return spans.flatMap((current, i) => {
    const next = spans[(i + 1) % spans.length] ?? current;
    const end = current.start + current.span;
    const gap = normalizeAngle(next.start - end);
    return gap > 0 && spans.length > 1 ? [normalizeAngle(end + gap / 2)] : [];
  });
}

/**
 * The middle of the edge facing the corridor: the inner arc of an outer
 * building, the outer arc of a middle one. The core is reached from the passages.
 */
function doorOf(slot: SlotDef): Polar | undefined {
  if (slot.shape === 'round') return undefined;
  if (slot.shape === 'square') {
    const center = pointToPolar(slot);
    return { radius: center.radius + slot.size / 2, angle: center.angle };
  }
  const { arc } = slot;
  const angle = normalizeAngle(arc.startAngle + normalizeAngle(arc.endAngle - arc.startAngle) / 2);
  return { radius: slot.type === 'outer' ? arc.innerRadius : arc.outerRadius, angle };
}

/** Joins neighboring corridor waypoints clockwise, except across a forbidden stretch. */
function linkCorridor(
  builder: GraphBuilder,
  ids: number[],
  isOpen: (from: number, to: number) => boolean,
): void {
  const sorted = [...ids].sort((a, b) => builder.angleOf(a) - builder.angleOf(b));
  if (sorted.length < 2) return;
  sorted.forEach((id, i) => {
    const next = sorted[(i + 1) % sorted.length];
    if (next === undefined || next === id) return;
    if (isOpen(builder.angleOf(id), builder.angleOf(next))) builder.link(id, next);
  });
}

/** Signed shortest turn from `from` to `to`, in degrees within (-180, 180]. */
export function angleDelta(from: number, to: number): number {
  const delta = normalizeAngle(to - from);
  return delta > 180 ? delta - 360 : delta;
}

export function edgeLength(a: Polar, b: Polar): number {
  const turn = (angleDelta(a.angle, b.angle) * Math.PI) / 180;
  return Math.hypot(((a.radius + b.radius) / 2) * turn, b.radius - a.radius);
}

/** Point a share `t` (0–1) of the way along the edge from `a` to `b`. */
export function alongEdge(a: Polar, b: Polar, t: number): Point {
  return polarToPoint({
    radius: a.radius + (b.radius - a.radius) * t,
    angle: normalizeAngle(a.angle + angleDelta(a.angle, b.angle) * t),
  });
}

/** Node ids from `from` to `to`, both included; empty when unreachable. */
export function pathBetween(graph: WalkGraph, from: number, to: number): number[] {
  const path = [from];
  let current = from;
  while (current !== to) {
    const next = graph.nextHop[current]?.[to] ?? -1;
    if (next < 0) return [];
    path.push(next);
    current = next;
  }
  return path;
}

class GraphBuilder {
  private readonly nodes: WalkNode[] = [];
  private readonly edges: Set<number>[] = [];

  add(node: WalkNode): number {
    this.nodes.push(node);
    this.edges.push(new Set());
    return this.nodes.length - 1;
  }

  link(a: number, b: number): void {
    this.edges[a]?.add(b);
    this.edges[b]?.add(a);
  }

  angleOf(id: number): number {
    return this.nodes[id]?.polar.angle ?? 0;
  }

  /** All pairs shortest paths (Floyd–Warshall): the graph has well under a hundred nodes. */
  finish(corridorRadius: number): WalkGraph {
    const size = this.nodes.length;
    const polarOf = (id: number) => this.nodes[id]?.polar ?? { radius: 0, angle: 0 };
    const distance = Array.from({ length: size }, (_, i) =>
      Array.from({ length: size }, (_, j) =>
        i === j ? 0 : this.edges[i]?.has(j) ? edgeLength(polarOf(i), polarOf(j)) : Infinity,
      ),
    );
    const nextHop = distance.map((row) => row.map((d, j) => (Number.isFinite(d) ? j : -1)));
    for (let k = 0; k < size; k++) {
      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          const through = (distance[i]?.[k] ?? Infinity) + (distance[k]?.[j] ?? Infinity);
          const row = distance[i];
          const hops = nextHop[i];
          if (!row || !hops || through >= (row[j] ?? Infinity)) continue;
          row[j] = through;
          hops[j] = hops[k] ?? -1;
        }
      }
    }
    const doors = new Map<string, number[]>();
    this.nodes.forEach((node, id) => {
      if (node.slotId) doors.set(node.slotId, [...(doors.get(node.slotId) ?? []), id]);
    });
    const finite = distance.flat().filter(Number.isFinite);
    return {
      nodes: this.nodes,
      neighbors: this.edges.map((set) => [...set]),
      doors,
      distance,
      nextHop,
      corridorRadius,
      speed: (Math.PI * corridorRadius) / 2 / QUARTER_CORRIDOR_SECONDS,
      longestTrip: Math.max(0, ...finite),
    };
  }
}
