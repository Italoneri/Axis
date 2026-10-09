import { describe, expect, it } from 'vitest';
import type { World } from '../model/schema';
import * as Influence from './Influence';
import {
  averageInfluence,
  clampPercent,
  initialInfluence,
  setWorldInfluence,
  worldStandings,
} from './Influence';
import { makeState, testCatalog } from './testFixtures';

const worlds: World[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({
  id,
  name: id.toUpperCase(),
  color: '#000000',
}));

function standingsOf(percents: number[]) {
  return worldStandings(worlds, Object.fromEntries(worlds.map((w, i) => [w.id, percents[i] ?? 0])));
}

describe('clampPercent', () => {
  it.each([
    { value: 42, percent: 42 },
    { value: -5, percent: 0 },
    { value: 140, percent: 100 },
    { value: 33.6, percent: 34 },
    { value: Number.NaN, percent: 0 },
  ])('keeps $value as $percent', ({ value, percent }) => {
    expect(clampPercent(value)).toBe(percent);
  });
});

describe('averageInfluence', () => {
  it.each([
    { name: 'varied values', percents: [10, 20, 30, 40, 50, 60, 70], average: 40 },
    { name: 'all at 0', percents: [0, 0, 0, 0, 0, 0, 0], average: 0 },
    { name: 'all at 100', percents: [100, 100, 100, 100, 100, 100, 100], average: 100 },
    { name: 'a decimal mean', percents: [35, 42, 0, 0, 25, 28, 0], average: 130 / 7 },
  ])('averages $name', ({ percents, average }) => {
    expect(averageInfluence(standingsOf(percents))).toBeCloseTo(average);
  });

  it('counts a world missing from the save as 0%', () => {
    expect(averageInfluence(worldStandings(worlds, { a: 70 }))).toBeCloseTo(10);
  });

  it('is 0 without worlds', () => {
    expect(averageInfluence([])).toBe(0);
  });
});

describe('initialInfluence', () => {
  it('starts every world at 0%', () => {
    expect(initialInfluence(worlds.slice(0, 2))).toEqual({ a: 0, b: 0 });
  });
});

describe('setWorldInfluence', () => {
  const catalogWorlds = testCatalog.worlds;

  it('changes one world, clamped, and logs it with the new total', () => {
    const state = makeState({ day: 20, influence: { human: 10, draconic: 35 } });
    const result = setWorldInfluence(state, catalogWorlds, { worldId: 'draconic', value: 42 });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.influence).toEqual({ human: 10, draconic: 42 });
    expect(averageInfluence(worldStandings(catalogWorlds, result.state.influence))).toBe(26);
    expect(result.state.log).toEqual([
      {
        day: 20,
        kind: 'influence_changed',
        world: 'Terras Dracônicas',
        from: 35,
        to: 42,
        total: 26,
      },
    ]);
  });

  it('logs the total rounded to one decimal', () => {
    const three = [...catalogWorlds, { id: 'elves', name: 'Floresta dos Elfos', color: '#4f9d5d' }];
    const state = makeState({ influence: { human: 0, draconic: 0, elves: 0 } });
    const result = setWorldInfluence(state, three, { worldId: 'human', value: 50 });
    expect(result.ok && result.state.log[0]).toMatchObject({ total: 16.7 });
  });

  it('clamps to 0–100', () => {
    const result = setWorldInfluence(makeState(), catalogWorlds, { worldId: 'human', value: 250 });
    expect(result.ok && result.state.influence.human).toBe(100);
  });

  it('does not log when nothing changes', () => {
    const state = makeState();
    expect(setWorldInfluence(state, catalogWorlds, { worldId: 'human', value: 0 })).toEqual({
      ok: true,
      state,
    });
  });

  it('refuses a world that is not in influence.json', () => {
    expect(
      setWorldInfluence(makeState(), catalogWorlds, { worldId: 'valdren', value: 10 }),
    ).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('fixed worlds', () => {
  it.each(['setTotalInfluence', 'addWorld', 'updateWorld', 'removeWorld'])(
    'offers no %s action',
    (name) => {
      expect(Object.keys(Influence)).not.toContain(name);
    },
  );
});
