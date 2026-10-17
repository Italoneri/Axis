import { describe, expect, it } from 'vitest';
import { HERB_GARDEN_BUILDING_ID } from '../model/catalog';
import { advanceDays, constructionProgress } from './TimeSystem';
import { herbGardenCatalog, makeState, testCatalog } from './testFixtures';

const building = (startedOnDay: number, completesOnDay: number, buildingId = 'forge') =>
  ({ buildingId, level: 1, status: 'building', startedOnDay, completesOnDay }) as const;

describe('advanceDays', () => {
  it('completes due constructions and logs them on their completion day, in order', () => {
    const state = makeState({
      day: 3,
      slots: {
        a: building(1, 6, 'forge'),
        b: building(2, 4, 'heart'),
        c: building(3, 9, 'armory'),
      },
    });
    const { state: next, completedSlotIds } = advanceDays(state, testCatalog, 3);

    expect(next.day).toBe(6);
    expect(completedSlotIds).toEqual(['b', 'a']);
    expect(next.slots['a']).toEqual({ buildingId: 'forge', level: 1, status: 'done' });
    expect(next.slots['c']?.status).toBe('building');
    expect(next.log).toEqual([
      { day: 4, kind: 'build_completed', buildingId: 'heart', level: 1, slotId: 'b' },
      { day: 6, kind: 'build_completed', buildingId: 'forge', level: 1, slotId: 'a' },
      { day: 6, kind: 'days_advanced', days: 3 },
    ]);
  });

  it('logsProductionOnceForTheWholeAdvance', () => {
    const state = makeState({
      slots: { outer_n: { buildingId: HERB_GARDEN_BUILDING_ID, level: 1, status: 'done' } },
    });
    const { state: next } = advanceDays(state, herbGardenCatalog, 3);

    expect(next.log.filter((e) => e.kind === 'building_produced')).toEqual([
      {
        day: 4,
        kind: 'building_produced',
        buildingId: HERB_GARDEN_BUILDING_ID,
        material: 'Madeira',
        quantity: 9,
      },
    ]);
  });

  it('rejects non-positive or fractional day counts', () => {
    expect(() => advanceDays(makeState(), testCatalog, 0)).toThrow();
    expect(() => advanceDays(makeState(), testCatalog, 1.5)).toThrow();
  });
});

describe('constructionProgress', () => {
  it.each([
    { day: 2, expected: 0 },
    { day: 4, expected: 0.5 },
    { day: 6, expected: 1 },
    { day: 10, expected: 1 },
  ])('returns $expected on day $day', ({ day, expected }) => {
    expect(constructionProgress(building(2, 6), day)).toBe(expected);
  });

  it('returns 1 for finished buildings', () => {
    expect(constructionProgress({ buildingId: 'forge', level: 1, status: 'done' }, 1)).toBe(1);
  });
});
