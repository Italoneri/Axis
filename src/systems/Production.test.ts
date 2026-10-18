import { describe, expect, it } from 'vitest';
import { HERB_GARDEN_BUILDING_ID } from '../model/catalog';
import type { PlacedBuilding } from '../model/schema';
import { EMPTY_PRODUCTION, produceOneDay, productionLog } from './Production';
import { herbGardenCatalog as catalog, makeState } from './testFixtures';

const garden = (placed: Partial<PlacedBuilding> & { level: number }) =>
  ({ buildingId: HERB_GARDEN_BUILDING_ID, status: 'done', ...placed }) as PlacedBuilding;

const building = (level: number): PlacedBuilding => ({
  buildingId: HERB_GARDEN_BUILDING_ID,
  level,
  status: 'building',
  startedOnDay: 1,
  completesOnDay: 5,
});

const woodOf = (state: ReturnType<typeof makeState>) =>
  state.materials.items.find((m) => m.id === 'wood')?.quantity;

describe('produceOneDay', () => {
  it.each([
    { level: 1, wood: 3 },
    { level: 2, wood: 6 },
    { level: 3, wood: 10 },
  ])('producesWoodPerLevel: level $level yields $wood', ({ level, wood }) => {
    const state = makeState({ slots: { outer_n: garden({ level }) } });
    const day = produceOneDay(state, catalog, EMPTY_PRODUCTION);

    expect(woodOf(day.state)).toBe(wood);
    expect([...day.tally.values()]).toEqual([
      { buildingId: HERB_GARDEN_BUILDING_ID, materialId: 'wood', amount: wood },
    ]);
  });

  it('producesAtLevelInForceDuringUpgrade', () => {
    const state = makeState({ slots: { outer_n: building(2) } });

    expect(woodOf(produceOneDay(state, catalog, EMPTY_PRODUCTION).state)).toBe(3);
  });

  it('producesNothingWhileFirstBuilding', () => {
    const state = makeState({ slots: { outer_n: building(1) } });
    const day = produceOneDay(state, catalog, EMPTY_PRODUCTION);

    expect(woodOf(day.state)).toBe(0);
    expect(day.tally.size).toBe(0);
  });

  it('skipsMaterialTheMasterDeleted', () => {
    const base = makeState({ slots: { outer_n: garden({ level: 1 }) } });
    const state = {
      ...base,
      materials: { ...base.materials, items: base.materials.items.filter((m) => m.id !== 'wood') },
    };
    const day = produceOneDay(state, catalog, EMPTY_PRODUCTION);

    expect(day.state).toBe(state);
    expect(day.tally.size).toBe(0);
  });
});

describe('productionLog', () => {
  it('namesTheMaterialAndSumsTheTally', () => {
    const state = makeState({ day: 4, slots: { outer_n: garden({ level: 1 }) } });
    const twoDays = [1, 2].reduce((acc) => produceOneDay(acc.state, catalog, acc.tally), {
      state,
      tally: EMPTY_PRODUCTION,
    });

    expect(productionLog(twoDays.tally, catalog, twoDays.state, 4)).toEqual([
      {
        day: 4,
        kind: 'building_produced',
        buildingId: HERB_GARDEN_BUILDING_ID,
        material: 'Madeira',
        quantity: 6,
      },
    ]);
  });
});
