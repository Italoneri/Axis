import { describe, expect, it } from 'vitest';
import type { Catalog } from '../model/catalog';
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
      { buildingId: 'heart', name: 'Coração', level: 1, effects: ['h1'], count: 1 },
      { buildingId: 'forge', name: 'Forja', level: 2, effects: ['f1', 'f2'], count: 1 },
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
      { buildingId: 'heart', name: 'Coração', level: 1, effects: ['h1'], count: 1 },
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
        hindered: false,
      },
    ]);
  });

  it('sums a good and a bad worker and flags the post as hindered', () => {
    const forging = { slotId: 'outer_n', activityId: 'forjar', carry: 0 };
    const state = makeState({
      slots: { outer_n: { buildingId: 'forge', level: 2, status: 'done' } },
      npcs: [
        npc({ id: 'a', name: 'Ana', job: forging, status: 'trabalhando' }),
        npc({
          id: 'b',
          name: 'Bia',
          skills: { smithing: -5 },
          job: forging,
          status: 'trabalhando',
        }),
      ],
    });
    expect(activePostEffects(state, testCatalog)).toMatchObject([
      { workers: ['Ana', 'Bia'], tenthsPerDay: 0, hindered: true },
    ]);
  });

  it.each([
    { name: 'with a penalty text', catalog: withPrayerPenalty('maldição'), shown: true },
    { name: 'without a penalty text', catalog: testCatalog, shown: false },
  ])('shows a hindered bonus post only $name', ({ catalog, shown }) => {
    const praying = { slotId: 'core', activityId: 'rezar', carry: 0 };
    const state = makeState({
      slots: { core: { buildingId: 'heart', level: 2, status: 'done' } },
      npcs: [
        npc({
          id: 'c',
          name: 'Caio',
          skills: { research: -1 },
          job: praying,
          status: 'trabalhando',
        }),
      ],
    });
    const posts = activePostEffects(state, catalog);
    expect(posts.map((p) => p.hindered)).toEqual(shown ? [true] : []);
  });
});

/** The test catalog with a penalty on the Coração's bonus post. */
function withPrayerPenalty(penalty: string): Catalog {
  const buildings = testCatalog.buildings.map((b) => ({
    ...b,
    levels: b.levels.map((level) => ({
      ...level,
      jobs: level.jobs?.map((job) =>
        job.effect.type === 'bonus' ? { ...job, effect: { ...job.effect, penalty } } : job,
      ),
    })),
  }));
  return { ...testCatalog, buildings };
}
