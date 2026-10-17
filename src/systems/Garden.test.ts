import { describe, expect, it } from 'vitest';
import { HERB_GARDEN_BUILDING_ID } from '../model/catalog';
import type { Crop, GameState, PlacedBuilding, Planting } from '../model/schema';
import type { Actor } from '../commands/schema';
import {
  addCrop,
  clearPlot,
  cropsFor,
  findCrop,
  harvest,
  isReady,
  plant,
  plotsInForce,
  removeCrop,
  updateCrop,
  type CropFields,
  type PlantOrder,
} from './Garden';
import type { Outcome } from './outcome';
import { herbGardenCatalog as catalog, makeState } from './testFixtures';

const placed = (level: number, status: PlacedBuilding['status'] = 'done'): PlacedBuilding =>
  ({
    buildingId: HERB_GARDEN_BUILDING_ID,
    level,
    status,
    startedOnDay: 1,
    completesOnDay: 5,
  }) as PlacedBuilding;

const gardenState = (level: number, status: PlacedBuilding['status'] = 'done') =>
  makeState({ slots: level === 0 ? {} : { outer_n: placed(level, status) } });

const common: Crop = {
  seedId: 'wood',
  harvestId: 'iron',
  plotType: 'canteiro',
  days: 3,
  yield: 2,
  rare: false,
  price: { gold: 1 },
};

describe('plotsInForce', () => {
  it.each([
    { level: 0, status: 'done', plots: 0 },
    { level: 1, status: 'done', plots: 8 },
    { level: 2, status: 'done', plots: 12 },
    { level: 3, status: 'done', plots: 13 },
    { level: 3, status: 'building', plots: 12 },
  ] as const)('countsPlots: level $level ($status) has $plots', ({ level, status, plots }) => {
    expect(plotsInForce(gardenState(level, status), catalog)).toHaveLength(plots);
  });
});

describe('addCrop', () => {
  it.each([
    { name: 'unknown seed material', crop: { ...common, seedId: 'nope' }, error: 'not_found' },
    {
      name: 'unknown harvest material',
      crop: { ...common, harvestId: 'nope' },
      error: 'not_found',
    },
  ])('refuses $name', ({ crop, error }) => {
    expect(addCrop(makeState(), crop)).toEqual({ ok: false, error });
  });

  it('refusesSecondCropForTheSameSeed', () => {
    const first = addCrop(makeState(), common);
    if (!first.ok) throw new Error(first.error);
    expect(addCrop(first.state, { ...common, days: 9 })).toEqual({
      ok: false,
      error: 'crop_already_exists',
    });
  });

  it('addsValidCrop', () => {
    const result = addCrop(makeState(), common);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.garden.crops).toEqual([common]);
  });
});

describe('updateCrop', () => {
  const withCrop = (): GameState => makeState({ garden: { crops: [common], plots: {} } });

  it('dropsThePriceWhenSwitchingToRare', () => {
    const { seedId: _seedId, price: _price, ...rest } = common;
    const fields: CropFields = { ...rest, rare: true };
    const result = updateCrop(withCrop(), 'wood', fields);
    if (!result.ok) throw new Error(result.error);
    expect(findCrop(result.state, 'wood')).toEqual({ ...rest, seedId: 'wood', rare: true });
  });

  it('refusesUnknownSeed', () => {
    const { seedId: _seedId, ...fields } = common;
    expect(updateCrop(withCrop(), 'nope', fields)).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('removeCrop', () => {
  it('refusesWhileAPlotHoldsIt', () => {
    const state = makeState({
      garden: { crops: [common], plots: { 'canteiro-1': { seedId: 'wood', growthTenths: 0 } } },
    });
    expect(removeCrop(state, 'wood')).toEqual({ ok: false, error: 'crop_in_use' });

    const cleared = { ...state, garden: { ...state.garden, plots: {} } };
    const result = removeCrop(cleared, 'wood');
    if (!result.ok) throw new Error(result.error);
    expect(result.state.garden.crops).toEqual([]);
  });
});

describe('cropsFor', () => {
  it('hidesCropsWhoseMaterialIsGone', () => {
    const state = makeState({
      garden: { crops: [common, { ...common, seedId: 'iron', harvestId: 'gone' }], plots: {} },
    });
    expect(cropsFor(state, 'canteiro').map((c) => c.seedId)).toEqual(['wood']);
    expect(cropsFor(state, 'muda')).toEqual([]);
  });
});

describe('isReady', () => {
  it.each([
    { growthTenths: 29, ready: false },
    { growthTenths: 30, ready: true },
  ])('readyAt30Tenths: $growthTenths is $ready', ({ growthTenths, ready }) => {
    expect(isReady(common, { seedId: 'wood', growthTenths })).toBe(ready);
  });
});

const player: Actor = { role: 'player', characterId: 'thorin' };
const master: Actor = { role: 'master' };

const mint: Crop = {
  seedId: 'semente_hortela',
  harvestId: 'hortela',
  plotType: 'canteiro',
  days: 3,
  yield: 4,
  rare: false,
  price: { bronze: 2 },
};
const moon: Crop = {
  seedId: 'semente_lunar',
  harvestId: 'flor_lunar',
  plotType: 'canteiro',
  days: 5,
  yield: 1,
  rare: true,
};

interface Setup {
  level?: number;
  seeds?: number;
  camp?: Record<string, number>;
  plots?: Record<string, Planting>;
  gone?: string[];
  crops?: Crop[];
}

/** An estufa de nível 1 with the two crops, `seeds` of each seed in stock and nothing planted. */
function plantingState({
  level = 1,
  seeds = 0,
  camp = { bronze: 10 },
  plots = {},
  gone = [],
  crops = [mint, moon],
}: Setup): GameState {
  const base = gardenState(level);
  const material = (id: string, quantity: number) => ({
    id,
    name: id.replace('_', ' '),
    category: 'ores',
    quantity,
  });
  const items = [
    material('semente_hortela', seeds),
    material('hortela', 0),
    material('semente_lunar', seeds),
    material('flor_lunar', 0),
  ].filter((m) => !gone.includes(m.id));
  return {
    ...base,
    wallets: { ...base.wallets, camp },
    materials: { ...base.materials, items: [...base.materials.items, ...items] },
    garden: { crops, plots },
  };
}

const stockOf = (state: GameState, id: string) =>
  state.materials.items.find((m) => m.id === id)?.quantity;

const order = (overrides: Partial<PlantOrder> = {}): PlantOrder => ({
  plotId: 'canteiro-1',
  seedId: 'semente_hortela',
  buy: false,
  ...overrides,
});

const grown = (seedId: string, days: number): Planting => ({ seedId, growthTenths: days * 10 });

function stateOf(result: Outcome): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe('plant', () => {
  it('consumesOwnedSeed', () => {
    const state = stateOf(plant(plantingState({ seeds: 3 }), catalog, order(), player));
    expect(stockOf(state, 'semente_hortela')).toBe(2);
    expect(state.garden.plots['canteiro-1']).toEqual({
      seedId: 'semente_hortela',
      growthTenths: 0,
    });
  });

  it('buysCommonSeedFromCamp', () => {
    const state = stateOf(plant(plantingState({}), catalog, order({ buy: true }), player));
    expect(state.wallets.camp).toEqual({ bronze: 8 });
    expect(stockOf(state, 'semente_hortela')).toBe(0);
    expect(state.garden.plots['canteiro-1']).toEqual({
      seedId: 'semente_hortela',
      growthTenths: 0,
    });
    expect(state.log.at(-1)).toMatchObject({
      kind: 'garden_planted',
      plot: 'canteiro-1',
      seed: 'semente hortela',
      bronze: 2,
    });
  });

  it('prefersOwnedSeedOverBuying', () => {
    const state = stateOf(
      plant(plantingState({ seeds: 1 }), catalog, order({ buy: true }), player),
    );
    expect(state.wallets.camp).toEqual({ bronze: 10 });
    expect(stockOf(state, 'semente_hortela')).toBe(0);
  });

  it('refusesBuyWhenCampIsShort', () => {
    const start = plantingState({ camp: { bronze: 1 } });
    expect(plant(start, catalog, order({ buy: true }), player)).toEqual({
      ok: false,
      error: 'insufficient_coins',
    });
    expect(start.garden.plots).toEqual({});
  });

  it('refusesRareWithoutSeed', () => {
    const result = plant(
      plantingState({}),
      catalog,
      order({ seedId: 'semente_lunar', buy: true }),
      player,
    );
    expect(result).toEqual({ ok: false, error: 'rare_not_for_sale' });
  });

  it('refusesWithoutSeedAndNoBuy', () => {
    expect(plant(plantingState({}), catalog, order(), player)).toEqual({
      ok: false,
      error: 'no_seed',
    });
  });

  it('masterPlantsForFree', () => {
    const state = stateOf(plant(plantingState({}), catalog, order(), master));
    expect(state.wallets.camp).toEqual({ bronze: 10 });
    expect(state.garden.plots['canteiro-1']?.seedId).toBe('semente_hortela');
    expect(state.log.at(-1)).toMatchObject({ kind: 'garden_planted', bronze: 0 });
  });

  it('refusesWrongPlotType', () => {
    const result = plant(plantingState({ seeds: 1 }), catalog, order({ plotId: 'muda-1' }), player);
    expect(result).toEqual({ ok: false, error: 'wrong_plot_type' });
  });

  it('refusesOccupiedPlot', () => {
    const start = plantingState({
      seeds: 1,
      plots: { 'canteiro-1': { seedId: 'semente_lunar', growthTenths: 5 } },
    });
    expect(plant(start, catalog, order(), player)).toEqual({ ok: false, error: 'plot_occupied' });
  });

  it('refusesPlotAboveLevelInForce', () => {
    const result = plant(
      plantingState({ seeds: 1 }),
      catalog,
      order({ plotId: 'estufa-1' }),
      player,
    );
    expect(result).toEqual({ ok: false, error: 'unknown_plot' });
  });

  it('refusesWithoutGarden', () => {
    const result = plant(plantingState({ level: 0, seeds: 1 }), catalog, order(), player);
    expect(result).toEqual({ ok: false, error: 'garden_not_built' });
  });

  it('refusesUnknownCrop', () => {
    const result = plant(plantingState({}), catalog, order({ seedId: 'nope' }), master);
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });

  it('refusesCropWhoseMaterialIsGone', () => {
    const result = plant(plantingState({ gone: ['hortela'] }), catalog, order(), master);
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('harvest', () => {
  it('perennialResetsGrowth', () => {
    const start = plantingState({ plots: { 'canteiro-1': grown('semente_hortela', 3) } });
    const state = stateOf(harvest(start, catalog, 'canteiro-1'));
    expect(stockOf(state, 'hortela')).toBe(4);
    expect(state.garden.plots['canteiro-1']).toEqual({
      seedId: 'semente_hortela',
      growthTenths: 0,
    });
  });

  it('rareEmptiesPlot', () => {
    const start = plantingState({ plots: { 'canteiro-1': grown('semente_lunar', 5) } });
    const state = stateOf(harvest(start, catalog, 'canteiro-1'));
    expect(stockOf(state, 'flor_lunar')).toBe(1);
    expect(state.garden.plots).toEqual({});
  });

  it('refusesGrowingPlot', () => {
    const start = plantingState({
      plots: { 'canteiro-1': { seedId: 'semente_hortela', growthTenths: 29 } },
    });
    expect(harvest(start, catalog, 'canteiro-1')).toEqual({ ok: false, error: 'not_ready' });
  });

  it('refusesEmptyPlot', () => {
    expect(harvest(plantingState({}), catalog, 'canteiro-1')).toEqual({
      ok: false,
      error: 'plot_empty',
    });
  });

  it('refusesUnknownPlot', () => {
    expect(harvest(plantingState({}), catalog, 'nope')).toEqual({
      ok: false,
      error: 'unknown_plot',
    });
  });

  it('harvestAllSkipsGrowingAndEmpty', () => {
    const start = plantingState({
      plots: {
        'canteiro-1': grown('semente_hortela', 3),
        'canteiro-2': { seedId: 'semente_hortela', growthTenths: 10 },
        'canteiro-3': grown('semente_lunar', 5),
      },
    });
    const state = stateOf(harvest(start, catalog, undefined));
    expect(stockOf(state, 'hortela')).toBe(4);
    expect(stockOf(state, 'flor_lunar')).toBe(1);
    expect(state.garden.plots).toEqual({
      'canteiro-1': { seedId: 'semente_hortela', growthTenths: 0 },
      'canteiro-2': { seedId: 'semente_hortela', growthTenths: 10 },
    });
  });

  it('harvestAllWithNothingReady', () => {
    const start = plantingState({
      plots: { 'canteiro-1': { seedId: 'semente_hortela', growthTenths: 10 } },
    });
    expect(harvest(start, catalog, undefined)).toEqual({ ok: false, error: 'nothing_changed' });
  });

  it('harvestsMissingMaterialAsNothing', () => {
    const start = plantingState({
      gone: ['hortela'],
      plots: { 'canteiro-1': grown('semente_hortela', 3) },
    });
    const state = stateOf(harvest(start, catalog, 'canteiro-1'));
    expect(state.garden.plots['canteiro-1']).toEqual({
      seedId: 'semente_hortela',
      growthTenths: 0,
    });
    expect(state.materials).toEqual(start.materials);
    expect(state.log).toEqual([]);
  });

  it('logsOneLinePerMaterial', () => {
    const start = plantingState({
      plots: {
        'canteiro-1': grown('semente_hortela', 3),
        'canteiro-2': grown('semente_hortela', 3),
      },
    });
    const state = stateOf(harvest(start, catalog, undefined));
    expect(state.log).toMatchObject([
      { kind: 'garden_harvested', material: 'hortela', quantity: 8 },
    ]);
  });

  it('ignoresPlotTypeEditedAfterPlanting', () => {
    const start = plantingState({
      plots: { 'canteiro-1': grown('semente_hortela', 3) },
      crops: [{ ...mint, plotType: 'muda' }, moon],
    });
    expect(harvest(start, catalog, 'canteiro-1').ok).toBe(true);
  });
});

describe('clearPlot', () => {
  it('emptiesWithoutHarvestOrSeedBack', () => {
    const start = plantingState({
      seeds: 1,
      plots: { 'canteiro-1': grown('semente_hortela', 3) },
    });
    const state = stateOf(clearPlot(start, catalog, 'canteiro-1'));
    expect(state.garden.plots).toEqual({});
    expect(stockOf(state, 'hortela')).toBe(0);
    expect(stockOf(state, 'semente_hortela')).toBe(1);
    expect(state.log.at(-1)).toMatchObject({
      kind: 'garden_cleared',
      plot: 'canteiro-1',
      seed: 'semente hortela',
    });
  });

  it('refusesEmptyPlot', () => {
    expect(clearPlot(plantingState({}), catalog, 'canteiro-1')).toEqual({
      ok: false,
      error: 'plot_empty',
    });
  });

  it('clearsWhenSeedMaterialIsGone', () => {
    const start = plantingState({
      gone: ['semente_hortela'],
      plots: { 'canteiro-1': grown('semente_hortela', 3) },
    });
    expect(stateOf(clearPlot(start, catalog, 'canteiro-1')).garden.plots).toEqual({});
  });
});
