import { describe, expect, it } from 'vitest';
import { adjustResources, forceBuilding, removeBuilding } from './MasterSystem';
import { makeState, testCatalog } from './testFixtures';

describe('adjustResources', () => {
  it('gives and takes resources, logging the applied delta', () => {
    const next = adjustResources(makeState({ day: 3 }), { gold: 50, arcana: 2 });
    expect(next.resources).toEqual({ gold: 150, arcana: 2 });
    expect(next.log).toEqual([
      { day: 3, kind: 'resources_adjusted', delta: { gold: 50, arcana: 2 } },
    ]);
  });

  it('stops at zero and logs only what was really taken', () => {
    const next = adjustResources(makeState({ resources: { gold: 20 } }), { gold: -50 });
    expect(next.resources).toEqual({ gold: 0 });
    expect(next.log.at(-1)).toMatchObject({ delta: { gold: -20 } });
  });

  it('returns the same state when nothing changes', () => {
    const state = makeState({ resources: { gold: 0 } });
    expect(adjustResources(state, { gold: -10, arcana: 0 })).toBe(state);
  });
});

describe('forceBuilding', () => {
  it('places a finished building ignoring costs and prerequisites', () => {
    const state = makeState({ resources: { gold: 0 } });
    const next = forceBuilding(state, testCatalog, {
      slotId: 'outer_n',
      buildingId: 'forge',
      level: 2,
    });
    expect(next.slots['outer_n']).toEqual({ buildingId: 'forge', level: 2, status: 'done' });
    expect(next.resources).toEqual({ gold: 0 });
    expect(next.log.at(-1)).toEqual({
      day: 1,
      kind: 'building_forced',
      buildingId: 'forge',
      level: 2,
    });
  });

  it('completes a construction in progress', () => {
    const state = makeState({
      slots: {
        core: {
          buildingId: 'heart',
          level: 1,
          status: 'building',
          startedOnDay: 1,
          completesOnDay: 3,
        },
      },
    });
    const next = forceBuilding(state, testCatalog, {
      slotId: 'core',
      buildingId: 'heart',
      level: 1,
    });
    expect(next.slots['core']?.status).toBe('done');
  });

  it.each([0, 3, 1.5])('rejects level %s', (level) => {
    expect(() =>
      forceBuilding(makeState(), testCatalog, { slotId: 'outer_n', buildingId: 'forge', level }),
    ).toThrow();
  });
});

describe('removeBuilding', () => {
  it('frees the slot and logs the removal', () => {
    const state = makeState({
      slots: { outer_n: { buildingId: 'forge', level: 2, status: 'done' } },
    });
    const next = removeBuilding(state, 'outer_n');
    expect(next.slots).toEqual({});
    expect(next.log.at(-1)).toMatchObject({ kind: 'building_removed', buildingId: 'forge' });
  });

  it('ignores an empty slot', () => {
    const state = makeState();
    expect(removeBuilding(state, 'outer_n')).toBe(state);
  });
});
