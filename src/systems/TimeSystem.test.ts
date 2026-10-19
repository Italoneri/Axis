import { describe, expect, it } from 'vitest';
import { ARCANE_LAB_BUILDING_ID, HERB_GARDEN_BUILDING_ID } from '../model/catalog';
import type { Brew } from '../model/schema';
import { brew } from './Lab';
import { advanceDays, constructionProgress } from './TimeSystem';
import { arcaneLabCatalog, herbGardenCatalog, makeState, testCatalog } from './testFixtures';

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

  const estufaCrop = {
    seedId: 'wood',
    harvestId: 'iron',
    plotType: 'estufa',
    days: 5,
    yield: 2,
    rare: false,
    price: { gold: 1 },
  } as const;
  const upgradingGarden = (growthTenths: number) =>
    makeState({
      day: 1,
      slots: {
        outer_n: {
          buildingId: HERB_GARDEN_BUILDING_ID,
          level: 3,
          status: 'building',
          startedOnDay: 1,
          completesOnDay: 2,
        },
      },
      garden: {
        crops: [estufaCrop],
        plots: { 'estufa-2': { seedId: 'wood', growthTenths } },
      },
    });

  it('settlesGardenWhenUpgradeCompletes', () => {
    const { state: next } = advanceDays(upgradingGarden(10), herbGardenCatalog, 1);

    expect(next.slots['outer_n']?.status).toBe('done');
    expect(next.garden.plots).toEqual({ 'estufa-1': { seedId: 'wood', growthTenths: 20 } });
  });

  it('harvestsPlantingReadyOnTheDayItsPlotVanishes', () => {
    const { state: next } = advanceDays(upgradingGarden(40), herbGardenCatalog, 1);

    expect(next.garden.plots).toEqual({});
    expect(next.log).toContainEqual(expect.objectContaining({ kind: 'garden_harvested' }));
    expect(next.log.some((entry) => entry.kind === 'garden_seed_returned')).toBe(false);
  });

  describe('lab', () => {
    const tonic: Brew = {
      recipeId: 'r-tonic',
      outputId: 'iron',
      outputQty: 1,
      days: 2,
      spent: [{ materialId: 'wood', quantity: 1 }],
      progressTenths: 0,
    };
    /** A lab nv1 whose nv2 works finish on day 2, brewing on `alambique-1`. */
    const upgradingLab = makeState({
      day: 1,
      slots: {
        outer_n: {
          buildingId: ARCANE_LAB_BUILDING_ID,
          level: 2,
          status: 'building',
          startedOnDay: 1,
          completesOnDay: 2,
        },
      },
      lab: {
        recipes: [
          {
            id: 'r-elixir',
            outputId: 'aetherium',
            outputQty: 1,
            ingredients: [{ materialId: 'wood', quantity: 1 }],
            stationType: 'caldeirao',
            days: 1,
            hidden: false,
          },
        ],
        stations: { 'alambique-1': tonic },
      },
    });
    const order = { stationId: 'caldeirao-1', recipeId: 'r-elixir' };
    const master = { role: 'master' } as const;

    it('advancesBrewsEachDay', () => {
      const { state: next } = advanceDays(upgradingLab, arcaneLabCatalog, 1);
      expect(next.lab.stations['alambique-1']?.progressTenths).toBe(10);
    });

    it('opensUpgradeStationsOnlyAfterTheWorksFinish', () => {
      expect(brew(upgradingLab, arcaneLabCatalog, order, master)).toEqual({
        ok: false,
        error: 'unknown_station',
      });
      const { state: next } = advanceDays(upgradingLab, arcaneLabCatalog, 1);
      expect(next.slots['outer_n']?.status).toBe('done');
      expect(next.lab.stations['alambique-1']).toBeDefined();
      expect(brew(next, arcaneLabCatalog, order, master).ok).toBe(true);
    });
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
