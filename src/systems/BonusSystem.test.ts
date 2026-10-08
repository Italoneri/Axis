import { describe, expect, it } from 'vitest';
import { activeBonuses } from './BonusSystem';
import { makeState, testCatalog } from './testFixtures';

describe('activeBonuses', () => {
  it('lists accumulated effects of finished levels in catalog order', () => {
    const state = makeState({
      slots: {
        outer_n: { buildingId: 'forge', level: 2, status: 'done' },
        core: { buildingId: 'heart', level: 1, status: 'done' },
      },
    });
    expect(activeBonuses(state, testCatalog)).toEqual([
      { buildingId: 'heart', name: 'Coração', level: 1, effects: ['h1'] },
      { buildingId: 'forge', name: 'Forja', level: 2, effects: ['f1', 'f2'] },
    ]);
  });

  it('skips buildings still under their first construction and keeps the old level during upgrades', () => {
    const state = makeState({
      slots: {
        outer_n: {
          buildingId: 'forge',
          level: 1,
          status: 'building',
          startedOnDay: 1,
          completesOnDay: 4,
        },
        core: {
          buildingId: 'heart',
          level: 2,
          status: 'building',
          startedOnDay: 1,
          completesOnDay: 4,
        },
      },
    });
    expect(activeBonuses(state, testCatalog)).toEqual([
      { buildingId: 'heart', name: 'Coração', level: 1, effects: ['h1'] },
    ]);
  });
});
