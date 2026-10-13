import { describe, expect, it } from 'vitest';
import { forceBuilding, removeBuilding } from './MasterSystem';
import { makeState, testCatalog, withCamp } from './testFixtures';

describe('forceBuilding', () => {
  it('places a finished building ignoring costs and prerequisites', () => {
    const state = withCamp({});
    const next = forceBuilding(state, testCatalog, {
      slotId: 'outer_n',
      buildingId: 'forge',
      level: 2,
    });
    expect(next.slots['outer_n']).toEqual({ buildingId: 'forge', level: 2, status: 'done' });
    expect(next.wallets.camp).toEqual({});
    expect(next.log.at(-1)).toEqual({
      day: 1,
      kind: 'building_forced',
      buildingId: 'forge',
      level: 2,
      slotId: 'outer_n',
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
