import type { GameState, Influence, World } from '../model/schema';
import { fail, ok, withLog, type Outcome } from './outcome';

// The worlds are fixed in influence.json; the master only sets each one's percent.
// The overall influence is always derived: the average of every world.

export interface WorldStanding {
  readonly world: World;
  readonly influence: number;
}

/** Whole percent between 0 and 100; anything unparseable counts as 0. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Every world in catalog order with its percent; a world missing from the save is at 0%. */
export function worldStandings(worlds: readonly World[], influence: Influence): WorldStanding[] {
  return worlds.map((world) => ({ world, influence: influence[world.id] ?? 0 }));
}

/** Arithmetic mean of the worlds' percents; 0 when there are none. */
export function averageInfluence(standings: readonly WorldStanding[]): number {
  if (standings.length === 0) return 0;
  return standings.reduce((sum, { influence }) => sum + influence, 0) / standings.length;
}

export function initialInfluence(worlds: readonly World[]): Influence {
  return Object.fromEntries(worlds.map((world) => [world.id, 0]));
}

export function setWorldInfluence(
  state: GameState,
  worlds: readonly World[],
  { worldId, value }: { worldId: string; value: number },
): Outcome {
  const world = worlds.find((w) => w.id === worldId);
  if (!world) return fail('not_found');
  const from = state.influence[worldId] ?? 0;
  const to = clampPercent(value);
  if (from === to) return ok(state);
  const influence = { ...state.influence, [worldId]: to };
  return ok(
    withLog(
      { ...state, influence },
      {
        day: state.day,
        kind: 'influence_changed',
        world: world.name,
        from,
        to,
        total: roundToTenth(averageInfluence(worldStandings(worlds, influence))),
      },
    ),
  );
}

/** The log keeps the total as shown (one decimal), so old entries read the same later. */
function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
