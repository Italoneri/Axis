import { describe, expect, it } from 'vitest';
import {
  addWorld,
  clampPercent,
  removeWorld,
  setTotalInfluence,
  setWorldInfluence,
  updateWorld,
  worldsByInfluence,
} from './Influence';
import { makeState } from './testFixtures';

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

describe('setTotalInfluence and setWorldInfluence', () => {
  it('changes the total on its own and logs it', () => {
    const result = setTotalInfluence(makeState({ day: 20 }), 55);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.influence.total).toBe(55);
    expect(result.state.influence.worlds[0]?.influence).toBe(30);
    expect(result.state.log).toEqual([{ day: 20, kind: 'influence_changed', from: 10, to: 55 }]);
  });

  it('changes a world independently, clamped, and logs it', () => {
    const result = setWorldInfluence(makeState({ day: 20 }), 'valdren', 250);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.influence).toMatchObject({ total: 10, worlds: [{ influence: 100 }] });
    expect(result.state.log).toEqual([
      { day: 20, kind: 'influence_changed', world: 'Valdren', from: 30, to: 100 },
    ]);
  });

  it('does not log when nothing changes', () => {
    const state = makeState();
    expect(setTotalInfluence(state, 10)).toEqual({ ok: true, state });
  });
});

describe('worlds', () => {
  it('adds, edits and removes worlds', () => {
    const added = addWorld(makeState(), { name: 'Nyx', color: '#222222', influence: 80 });
    if (!added.ok) throw new Error(added.error);
    expect(worldsByInfluence(added.state.influence.worlds).map((w) => w.id)).toEqual([
      'nyx',
      'valdren',
    ]);

    const edited = updateWorld(added.state, 'nyx', { name: 'Nyx Sombria', color: '#000000' });
    if (!edited.ok) throw new Error(edited.error);
    expect(edited.state.influence.worlds[1]).toEqual({
      id: 'nyx',
      name: 'Nyx Sombria',
      color: '#000000',
      influence: 80,
    });

    const removed = removeWorld(edited.state, 'valdren');
    expect(removed.ok && removed.state.influence.worlds.map((w) => w.id)).toEqual(['nyx']);
  });

  it('refuses a repeated name', () => {
    expect(addWorld(makeState(), { name: 'valdren', color: '#000000', influence: 0 })).toEqual({
      ok: false,
      error: 'duplicate_name',
    });
  });
});
