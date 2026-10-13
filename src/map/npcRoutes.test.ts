import { describe, expect, it } from 'vitest';
import { gameData } from '../data/gameData';
import type { Npc } from '../model/schema';
import { isAngleWithin, pointToPolar, type Point } from './geometry';
import {
  BLOCK_SECONDS,
  blockAt,
  intentFor,
  poseAt,
  scheduleFor,
  walkerPoseAt,
  type WalkIntent,
  type WalkerNpc,
} from './npcRoutes';
import { angleDelta, buildWalkGraph, pathBetween, type WalkGraph } from './walkGraph';

const { layout } = gameData;
const graph = buildWalkGraph(layout);
const NOON = 1_760_000_000;

const npc = (fields: Partial<WalkerNpc> = {}): WalkerNpc => ({
  id: 'npc_mara',
  status: 'disponivel',
  home: null,
  job: null,
  ...fields,
});
const job = (slotId: string): Npc['job'] => ({ slotId, activityId: 'forjar', carry: 0 });
const homeDoor = (slotId: string) => graph.doors.get(slotId)?.[0];

const worker = intentFor(
  npc({ status: 'trabalhando', home: 'outer_2', job: job('mid_3') }),
  graph,
  new Map(),
);
const stroller = intentFor(npc(), graph, new Map());
const injured = intentFor(
  npc({ status: 'ferido', home: 'outer_2' }),
  graph,
  new Map([['outer_5', 'infirmary']]),
);
const INTENTS: [string, WalkIntent][] = [
  ['commute', worker],
  ['wander', stroller],
  ['linger', injured],
];

/** Every second over two whole blocks, starting mid block. */
function samples(intent: WalkIntent, id = 'npc_mara'): Point[] {
  const start = NOON - (NOON % BLOCK_SECONDS) + BLOCK_SECONDS / 2;
  return Array.from({ length: BLOCK_SECONDS * 2 }, (_, s) => {
    const pose = walkerPoseAt(id, intent, graph, start + s);
    if (!pose) throw new Error('expected a pose');
    return pose.point;
  });
}

function isOnGraph(point: Point, g: WalkGraph): boolean {
  const { radius, angle } = pointToPolar(point);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  return g.neighbors.some((ids, from) =>
    ids.some((to) => {
      const a = g.nodes[from]?.polar;
      const b = g.nodes[to]?.polar;
      if (!a || !b) return false;
      const isRadial = near(angleDelta(a.angle, b.angle), 0);
      if (isRadial) {
        const between =
          radius >= Math.min(a.radius, b.radius) - 1e-6 &&
          radius <= Math.max(a.radius, b.radius) + 1e-6;
        return near(angleDelta(a.angle, angle), 0) && between;
      }
      const [start, end] =
        angleDelta(a.angle, b.angle) > 0 ? [a.angle, b.angle] : [b.angle, a.angle];
      return (
        near(radius, a.radius) &&
        (isAngleWithin(angle, start, end) || near(angleDelta(start, angle), 0))
      );
    }),
  );
}

describe('buildWalkGraph', () => {
  it('runs the corridor between the middle and the outer rings', () => {
    expect(graph.corridorRadius).toBeCloseTo((0.274 + 0.358) / 2, 6);
  });

  it('gives every middle and outer building a reachable door', () => {
    const buildings = layout.slots.filter((slot) => slot.type !== 'core');
    buildings.forEach((slot) => {
      const door = graph.doors.get(slot.id)?.[0];
      expect(door, slot.id).toBeDefined();
      expect(pathBetween(graph, 0, door ?? 0).length, slot.id).toBeGreaterThan(0);
    });
  });

  it('reaches the core through the passages and leaves through every open entrance', () => {
    expect(graph.doors.get('core')?.length).toBeGreaterThan(0);
    const outside = graph.nodes.filter((node) => node.kind === 'outside');
    expect(outside).toHaveLength(layout.entrances.angles.length);
  });

  it('puts no waypoint inside the reserved stretch', () => {
    graph.nodes.forEach(({ polar }) =>
      layout.reserved.forEach((r) =>
        expect(isAngleWithin(polar.angle, r.startAngle, r.endAngle)).toBe(false),
      ),
    );
  });

  it('walks a quarter of the corridor in about 20 s', () => {
    const quarter = (Math.PI * graph.corridorRadius) / 2;
    expect(quarter / graph.speed).toBeCloseTo(20, 6);
  });
});

describe('intentFor', () => {
  it('sends a worker between the doors of home and post', () => {
    expect(worker).toEqual({ kind: 'commute', home: homeDoor('outer_2'), work: homeDoor('mid_3') });
  });

  it('lets an available NPC stroll', () => {
    expect(stroller.kind).toBe('wander');
  });

  it('keeps an injured NPC by the Enfermaria, or by home without one', () => {
    expect(injured).toMatchObject({ kind: 'linger', door: homeDoor('outer_5') });
    const atHome = intentFor(npc({ status: 'ferido', home: 'outer_2' }), graph, new Map());
    expect(atHome).toMatchObject({ kind: 'linger', door: homeDoor('outer_2') });
  });

  it('hides an NPC on a mission', () => {
    expect(intentFor(npc({ status: 'em_missao' }), graph, new Map())).toEqual({ kind: 'hidden' });
    expect(walkerPoseAt('npc_mara', { kind: 'hidden' }, graph, NOON)).toBeUndefined();
  });

  it('lets a worker whose home is gone stroll instead', () => {
    const homeless = intentFor(npc({ status: 'trabalhando', job: job('mid_3') }), graph, new Map());
    expect(homeless.kind).toBe('wander');
  });
});

describe('walking poses', () => {
  it('is the same for the same id and time, and differs between NPCs', () => {
    expect(walkerPoseAt('npc_mara', stroller, graph, NOON)).toEqual(
      walkerPoseAt('npc_mara', stroller, graph, NOON),
    );
    const a = samples(stroller, 'npc_mara');
    const b = samples(stroller, 'npc_tobias');
    expect(a).not.toEqual(b);
  });

  it.each(INTENTS)('%s never jumps, not even between trips or blocks', (_, intent) => {
    const points = samples(intent);
    const maxStep = graph.speed * 1.001 + 1e-9;
    points.slice(1).forEach((point, i) => {
      const previous = points[i] ?? point;
      expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeLessThanOrEqual(maxStep);
    });
  });

  it('tells points off the graph apart', () => {
    expect(isOnGraph({ x: 0.58, y: 0.06 }, graph)).toBe(false);
    expect(isOnGraph({ x: 0.52, y: 0.5 - graph.corridorRadius - 0.01 }, graph)).toBe(false);
  });

  it.each(INTENTS)('%s stays on the graph and out of the reserved stretch', (_, intent) => {
    samples(intent).forEach((point) => {
      expect(isOnGraph(point, graph)).toBe(true);
      const { angle } = pointToPolar(point);
      layout.reserved.forEach((r) =>
        expect(isAngleWithin(angle, r.startAngle, r.endAngle)).toBe(false),
      );
    });
  });

  it('fills each block with trips from 40 s and ends where the next block starts', () => {
    const block = blockAt(NOON);
    const { trips } = scheduleFor('npc_mara', stroller, graph, block);
    expect(trips[0]?.start).toBe(block * BLOCK_SECONDS);
    expect(trips.at(-1)?.end).toBe((block + 1) * BLOCK_SECONDS);
    trips.slice(0, -1).forEach((trip) => expect(trip.end - trip.start).toBeGreaterThanOrEqual(40));
    trips.forEach((trip) => expect(trip.arrive).toBeLessThanOrEqual(trip.end));
    const next = scheduleFor('npc_mara', stroller, graph, block + 1);
    expect(next.trips[0]?.path[0]).toBe(trips.at(-1)?.path.at(-1));
  });

  it('shows a worker only outside, fading at the doors', () => {
    const schedule = scheduleFor('npc_mara', worker, graph, blockAt(NOON));
    const trip = schedule.trips[1];
    if (!trip) throw new Error('expected a trip');
    const halfway = (trip.start + trip.arrive) / 2;
    expect(poseAt(schedule, graph, halfway)).toMatchObject({ moving: true, alpha: 1 });
    expect(poseAt(schedule, graph, trip.start)?.alpha).toBe(0);
    expect(poseAt(schedule, graph, trip.end - 0.01)?.alpha).toBe(0);
  });
});
