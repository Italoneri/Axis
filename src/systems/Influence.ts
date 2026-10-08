import type { GameState, Influence, World } from '../model/schema';
import { nameError, uniqueId } from './Categories';
import { fail, ok, withLog, type Outcome } from './outcome';

// The overall influence and each world's influence are independent values set
// by the master: worlds do not need to add up to 100% nor to the total.

export interface WorldFields {
  name: string;
  color: string;
  icon?: string | undefined;
  description?: string | undefined;
}

/** Whole percent between 0 and 100; anything unparseable counts as 0. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function worldsByInfluence(worlds: readonly World[]): World[] {
  return [...worlds].sort((a, b) => b.influence - a.influence || a.name.localeCompare(b.name));
}

export function setTotalInfluence(state: GameState, value: number): Outcome {
  const from = state.influence.total;
  const to = clampPercent(value);
  if (from === to) return ok(state);
  return ok(
    withLog(setInfluence(state, { ...state.influence, total: to }), {
      day: state.day,
      kind: 'influence_changed',
      from,
      to,
    }),
  );
}

export function setWorldInfluence(state: GameState, worldId: string, value: number): Outcome {
  const world = state.influence.worlds.find((w) => w.id === worldId);
  if (!world) return fail('not_found');
  const to = clampPercent(value);
  if (world.influence === to) return ok(state);
  return ok(
    withLog(replaceWorld(state, { ...world, influence: to }), {
      day: state.day,
      kind: 'influence_changed',
      world: world.name,
      from: world.influence,
      to,
    }),
  );
}

export function addWorld(state: GameState, fields: WorldFields & { influence: number }): Outcome {
  const { worlds } = state.influence;
  const error = nameError(fields.name, worlds);
  if (error) return fail(error);
  const world: World = {
    ...cleanFields(fields),
    id: uniqueId(
      fields.name,
      worlds.map((w) => w.id),
    ),
    influence: clampPercent(fields.influence),
  };
  return ok(
    withLog(setInfluence(state, { ...state.influence, worlds: [...worlds, world] }), {
      day: state.day,
      kind: 'world_added',
      name: world.name,
    }),
  );
}

/** Edits how the world looks; its influence changes through `setWorldInfluence`. */
export function updateWorld(state: GameState, id: string, fields: WorldFields): Outcome {
  const world = state.influence.worlds.find((w) => w.id === id);
  if (!world) return fail('not_found');
  const error = nameError(fields.name, state.influence.worlds, id);
  if (error) return fail(error);
  return ok(replaceWorld(state, { ...cleanFields(fields), id, influence: world.influence }));
}

export function removeWorld(state: GameState, id: string): Outcome {
  const { worlds } = state.influence;
  const world = worlds.find((w) => w.id === id);
  if (!world) return fail('not_found');
  return ok(
    withLog(
      setInfluence(state, { ...state.influence, worlds: worlds.filter((w) => w.id !== id) }),
      { day: state.day, kind: 'world_removed', name: world.name },
    ),
  );
}

function replaceWorld(state: GameState, world: World): GameState {
  const worlds = state.influence.worlds.map((w) => (w.id === world.id ? world : w));
  return setInfluence(state, { ...state.influence, worlds });
}

function setInfluence(state: GameState, influence: Influence): GameState {
  return { ...state, influence };
}

function cleanFields(fields: WorldFields): Omit<World, 'id' | 'influence'> {
  const icon = fields.icon?.trim();
  const description = fields.description?.trim();
  return {
    name: fields.name.trim(),
    color: fields.color,
    ...(icon ? { icon } : {}),
    ...(description ? { description } : {}),
  };
}
