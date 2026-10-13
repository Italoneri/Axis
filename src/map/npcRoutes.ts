import type { Npc } from '../model/schema';
import type { Point } from './geometry';
import { facingFor, type Facing } from './npcSprites';
import { hashString, seededRandom } from './random';
import { alongEdge, edgeLength, pathBetween, type WalkGraph } from './walkGraph';

// Where a walking NPC is at a given moment, as a pure function of its id, what
// it is doing and the wall clock. Every browser computes the same scene without
// talking to the server: time is cut into blocks, each block into trips whose
// destinations and lengths come from a generator seeded by (id, block).

/** A block starts and ends at a known anchor, so its trips never depend on earlier blocks. */
export const BLOCK_SECONDS = 600;
const TRIP_MIN_SECONDS = 40;
const TRIP_MAX_SECONDS = 90;
/** The shortest stop at a destination before the next trip. */
const MIN_STOP_SECONDS = 4;
/** Fade into and out of a building's door. */
export const DOOR_FADE_SECONDS = 0.8;
/** Share of an edge used to read the heading around a point. */
const HEADING_STEP = 0.01;

export const INFIRMARY_BUILDING_ID = 'infirmary';

/** What the NPC does on the map, which decides where its trips go. */
export type WalkIntent =
  | { readonly kind: 'hidden' }
  /** Back and forth between home and post, disappearing inside each. */
  | { readonly kind: 'commute'; readonly home: number; readonly work: number }
  /** Strolls between random waypoints. */
  | { readonly kind: 'wander'; readonly waypoints: readonly number[] }
  /** Stays by a door, barely moving. */
  | { readonly kind: 'linger'; readonly door: number; readonly spot: number };

export type WalkerNpc = Pick<Npc, 'id' | 'status' | 'home' | 'job'>;

export interface Pose {
  readonly point: Point;
  readonly facing: Facing;
  readonly moving: boolean;
  /** 0 while inside a building, fading at its door. */
  readonly alpha: number;
}

interface Trip {
  readonly start: number;
  readonly arrive: number;
  readonly end: number;
  readonly path: readonly number[];
  /** Commuters leave a building at the start and go into one on arrival. */
  readonly throughDoors: boolean;
}

export interface Schedule {
  readonly block: number;
  readonly trips: readonly Trip[];
}

/**
 * `slotBuildings` maps each slot to the building on it, to find the Enfermaria.
 * A slot whose door is unreachable counts as missing.
 */
export function intentFor(
  npc: WalkerNpc,
  graph: WalkGraph,
  slotBuildings: ReadonlyMap<string, string>,
): WalkIntent {
  const seed = hashString(npc.id);
  const door = (slotId: string | null | undefined) => pickDoor(graph, slotId, seed);
  const home = door(npc.home);
  switch (npc.status) {
    case 'em_missao':
      return { kind: 'hidden' };
    case 'trabalhando': {
      const work = door(npc.job?.slotId);
      if (home !== undefined && work !== undefined) return { kind: 'commute', home, work };
      return wander(graph);
    }
    case 'ferido': {
      const infirmary = [...slotBuildings].find(
        ([, building]) => building === INFIRMARY_BUILDING_ID,
      );
      const target = door(infirmary?.[0]) ?? home;
      return target === undefined ? wander(graph) : linger(graph, target);
    }
    case 'disponivel':
      return wander(graph);
  }
}

export function scheduleFor(
  npcId: string,
  intent: WalkIntent,
  graph: WalkGraph,
  block: number,
): Schedule {
  if (intent.kind === 'hidden') return { block, trips: [] };
  const blockStart = block * BLOCK_SECONDS;
  const blockEnd = blockStart + BLOCK_SECONDS;
  // The last trip must always reach the next block's anchor in time.
  const reserve = graph.longestTrip / graph.speed + MIN_STOP_SECONDS;
  const random = seededRandom(hashString(`${npcId}:${block}`));
  const throughDoors = intent.kind === 'commute';
  const trips: Trip[] = [];
  const tripFrom = (from: number, to: number, start: number, end: number): Trip => ({
    start,
    arrive: start + (graph.distance[from]?.[to] ?? 0) / graph.speed,
    end,
    path: pathBetween(graph, from, to),
    throughDoors,
  });

  let time = blockStart;
  let at = anchorOf(npcId, intent, block);
  for (;;) {
    const to = nextStop(intent, at, random);
    const travel = (graph.distance[at]?.[to] ?? 0) / graph.speed;
    const length = Math.max(
      lerp(TRIP_MIN_SECONDS, TRIP_MAX_SECONDS, random()),
      travel + MIN_STOP_SECONDS,
    );
    if (time + length > blockEnd - reserve) break;
    trips.push(tripFrom(at, to, time, time + length));
    time += length;
    at = to;
  }
  trips.push(tripFrom(at, anchorOf(npcId, intent, block + 1), time, blockEnd));
  return { block, trips };
}

export function blockAt(seconds: number): number {
  return Math.floor(seconds / BLOCK_SECONDS);
}

/** Where the schedule puts the NPC at `seconds`; undefined when it is hidden. */
export function poseAt(schedule: Schedule, graph: WalkGraph, seconds: number): Pose | undefined {
  const trip = schedule.trips.find((candidate) => seconds < candidate.end) ?? schedule.trips.at(-1);
  if (!trip) return undefined;
  const elapsed = Math.max(0, seconds - trip.start);
  const walked = Math.min(elapsed * graph.speed, totalLength(graph, trip.path));
  const { point, facing } = pointAlong(graph, trip.path, walked);
  const moving = seconds < trip.arrive;
  const alpha = trip.throughDoors
    ? Math.min(
        clamp01(elapsed / DOOR_FADE_SECONDS),
        1 - clamp01((seconds - trip.arrive) / DOOR_FADE_SECONDS),
      )
    : 1;
  return { point, facing, moving, alpha };
}

/** Convenience for one-off lookups; the map caches the schedule per block instead. */
export function walkerPoseAt(
  npcId: string,
  intent: WalkIntent,
  graph: WalkGraph,
  seconds: number,
): Pose | undefined {
  return poseAt(scheduleFor(npcId, intent, graph, blockAt(seconds)), graph, seconds);
}

function anchorOf(npcId: string, intent: WalkIntent, block: number): number {
  switch (intent.kind) {
    case 'hidden':
      return 0;
    case 'commute':
      return intent.home;
    case 'linger':
      return intent.spot;
    case 'wander': {
      const random = seededRandom(hashString(`${npcId}:anchor:${block}`));
      return pick(intent.waypoints, random) ?? 0;
    }
  }
}

function nextStop(intent: WalkIntent, at: number, random: () => number): number {
  switch (intent.kind) {
    case 'hidden':
      return at;
    case 'commute':
      return at === intent.home ? intent.work : intent.home;
    case 'linger':
      return at === intent.spot ? intent.door : intent.spot;
    case 'wander': {
      const others = intent.waypoints.filter((id) => id !== at);
      return pick(others, random) ?? at;
    }
  }
}

function wander(graph: WalkGraph): WalkIntent {
  const waypoints = graph.nodes.flatMap((node, id) =>
    node.kind === 'corridor' || node.kind === 'gap' || node.kind === 'outside' ? [id] : [],
  );
  return { kind: 'wander', waypoints };
}

/** Waits on the corridor in front of the door, stepping to it now and then. */
function linger(graph: WalkGraph, door: number): WalkIntent {
  const spot = graph.neighbors[door]?.[0] ?? door;
  return { kind: 'linger', door, spot };
}

/** The core has a door per passage; each NPC keeps using the same one. */
function pickDoor(
  graph: WalkGraph,
  slotId: string | null | undefined,
  seed: number,
): number | undefined {
  const doors = slotId ? graph.doors.get(slotId) : undefined;
  if (!doors || doors.length === 0) return undefined;
  return doors[seed % doors.length];
}

function pointAlong(
  graph: WalkGraph,
  path: readonly number[],
  walked: number,
): { point: Point; facing: Facing } {
  let left = walked;
  let facing: Facing = 'south';
  let point = polarPoint(graph, path[0] ?? 0, path[0] ?? 0, 0);
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1] ?? 0;
    const to = path[i] ?? 0;
    const length = edgeLengthOf(graph, from, to);
    if (length === 0) continue;
    const t = Math.min(1, left / length);
    point = polarPoint(graph, from, to, t);
    // The heading right here: corridor edges curve.
    const ahead = polarPoint(graph, from, to, Math.min(1, t + HEADING_STEP));
    const behind = polarPoint(graph, from, to, Math.max(0, t - HEADING_STEP));
    facing = facingFor(ahead.x - behind.x, ahead.y - behind.y);
    if (left <= length) break;
    left -= length;
  }
  return { point, facing };
}

function polarPoint(graph: WalkGraph, from: number, to: number, t: number): Point {
  const a = graph.nodes[from]?.polar ?? { radius: 0, angle: 0 };
  const b = graph.nodes[to]?.polar ?? a;
  return alongEdge(a, b, t);
}

function totalLength(graph: WalkGraph, path: readonly number[]): number {
  return path.slice(1).reduce((sum, to, i) => sum + edgeLengthOf(graph, path[i] ?? to, to), 0);
}

function edgeLengthOf(graph: WalkGraph, from: number, to: number): number {
  const a = graph.nodes[from]?.polar;
  const b = graph.nodes[to]?.polar;
  return a && b ? edgeLength(a, b) : 0;
}

function pick<T>(items: readonly T[], random: () => number): T | undefined {
  return items[Math.floor(random() * items.length)];
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
