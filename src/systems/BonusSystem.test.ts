import { describe, expect, it } from 'vitest';
import { activeBonuses, activePostEffects } from './BonusSystem';
import { makeState, npc, testCatalog } from './testFixtures';

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

describe('activePostEffects', () => {
  it('sums the daily yield of the NPCs on duty and skips idle ones', () => {
    const forging = { slotId: 'outer_n', activityId: 'forjar', carry: 0 };
    const praying = { slotId: 'core', activityId: 'rezar', carry: 0 };
    const state = makeState({
      slots: {
        core: { buildingId: 'heart', level: 2, status: 'done' },
        outer_n: { buildingId: 'forge', level: 2, status: 'done' },
      },
      npcs: [
        npc({ id: 'a', name: 'Ana', skills: { smithing: 7 }, job: forging, status: 'trabalhando' }),
        npc({ id: 'b', name: 'Bia', job: forging, status: 'trabalhando' }),
        npc({ id: 'c', name: 'Caio', job: praying, status: 'ferido' }),
      ],
    });
    expect(activePostEffects(state, testCatalog)).toEqual([
      {
        slotId: 'outer_n',
        buildingId: 'forge',
        activity: 'Forjar',
        workers: ['Ana', 'Bia'],
        effect: { type: 'produce', material: 'iron', perDay: 2 },
        tenthsPerDay: 54,
      },
    ]);
  });
});
