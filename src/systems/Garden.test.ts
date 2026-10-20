import { describe, expect, it } from 'vitest';
import { HERB_GARDEN_BUILDING_ID } from '../model/catalog';
import type { Crop, GameState, PlacedBuilding, Planting, StockRef } from '../model/schema';
import { gameCommandSchema, type Actor } from '../commands/schema';
import {
  addCrop,
  clearPlot,
  cropsFor,
  findCrop,
  growGarden,
  harvest,
  isReady,
  plant,
  plotsInForce,
  removeCrop,
  settleGarden,
  updateCrop,
  type CropFields,
  type PlantOrder,
} from './Garden';
import type { StockedOutcome } from './outcome';
import type { DepotSnapshot } from './Stock';
import { advanceDays } from './TimeSystem';
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

const material = (materialId: string): StockRef => ({ source: 'material', materialId });
const item = (itemId: string): StockRef => ({ source: 'depot', itemId });
const NO_DEPOT: DepotSnapshot = [];

const common: Crop = {
  id: 'wood',
  seed: material('wood'),
  harvest: material('iron'),
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
    {
      name: 'unknown seed material',
      crop: { ...common, seed: material('nope') },
      error: 'not_found',
    },
    {
      name: 'unknown harvest material',
      crop: { ...common, harvest: material('nope') },
      error: 'not_found',
    },
    { name: 'free common crop', crop: { ...common, price: {} }, error: 'empty_price' },
    {
      name: 'zero-priced common crop',
      crop: { ...common, price: { gold: 0 } },
      error: 'empty_price',
    },
  ])('refuses $name', ({ crop, error }) => {
    expect(addCrop(makeState(), catalog, crop, NO_DEPOT)).toEqual({ ok: false, error });
  });

  it('refusesSecondCropForTheSameSeed', () => {
    const first = addCrop(makeState(), catalog, common, NO_DEPOT);
    if (!first.ok) throw new Error(first.error);
    expect(addCrop(first.state, catalog, { ...common, days: 9 }, NO_DEPOT)).toEqual({
      ok: false,
      error: 'crop_already_exists',
    });
  });

  it('addsValidCrop', () => {
    const result = addCrop(makeState(), catalog, common, NO_DEPOT);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.garden.crops).toEqual([common]);
  });
});

describe('updateCrop', () => {
  const withCrop = (): GameState => makeState({ garden: { crops: [common], plots: {} } });
  const sharedFields = {
    seed: common.seed,
    harvest: common.harvest,
    plotType: common.plotType,
    days: common.days,
    yield: common.yield,
  };

  it('dropsThePriceWhenSwitchingToRare', () => {
    const fields: CropFields = { ...sharedFields, rare: true };
    const result = updateCrop(withCrop(), catalog, 'wood', fields, NO_DEPOT);
    if (!result.ok) throw new Error(result.error);
    expect(findCrop(result.state, 'wood')).toEqual({ ...fields, id: 'wood' });
  });

  it.each([
    { name: 'empty price', price: {} },
    { name: 'zero price', price: { gold: 0 } },
  ])('refusesCommonCropWith $name', ({ price }) => {
    const fields: CropFields = { ...sharedFields, rare: false, price };
    expect(updateCrop(withCrop(), catalog, 'wood', fields, NO_DEPOT)).toEqual({
      ok: false,
      error: 'empty_price',
    });
  });

  it('refusesUnknownSeed', () => {
    const fields: CropFields = { ...sharedFields, rare: false, price: common.price };
    expect(updateCrop(withCrop(), catalog, 'nope', fields, NO_DEPOT)).toEqual({
      ok: false,
      error: 'not_found',
    });
  });
});

describe('crop look', () => {
  const look = { kind: 'flower', hue: -95 } as const;

  it('keepsTheLookOfANewCrop', () => {
    const result = addCrop(makeState(), catalog, { ...common, look }, NO_DEPOT);
    if (!result.ok) throw new Error(result.error);
    expect(findCrop(result.state, 'wood')?.look).toEqual(look);
  });

  it('changesTheLookOnUpdate', () => {
    const fields: CropFields = { ...common, look };
    const result = updateCrop(
      makeState({ garden: { crops: [common], plots: {} } }),
      catalog,
      'wood',
      fields,
      NO_DEPOT,
    );
    if (!result.ok) throw new Error(result.error);
    expect(findCrop(result.state, 'wood')?.look).toEqual(look);
  });

  it.each([
    { name: 'no look', look: undefined, valid: true },
    { name: 'a flower', look: { kind: 'flower', hue: 180 }, valid: true },
    { name: 'a hue past a half turn', look: { kind: 'flower', hue: 181 }, valid: false },
    { name: 'a broken hue', look: { kind: 'flower', hue: 1.5 }, valid: false },
    { name: 'an unknown kind', look: { kind: 'tree', hue: 0 }, valid: false },
  ])('validatesCommandWith $name', ({ look: chosen, valid }) => {
    const { id, ...fields } = common;
    const crop = chosen ? { ...fields, look: chosen } : fields;
    const commands = [
      { type: 'garden_crop_create', id, crop },
      { type: 'garden_crop_update', cropId: id, crop },
    ];
    commands.forEach((command) => expect(gameCommandSchema.safeParse(command).success).toBe(valid));
  });
});

describe('removeCrop', () => {
  it('refusesWhileAPlotHoldsIt', () => {
    const state = makeState({
      garden: { crops: [common], plots: { 'canteiro-1': { cropId: 'wood', growthTenths: 0 } } },
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
      garden: {
        crops: [
          common,
          { ...common, id: 'iron', seed: material('iron'), harvest: material('gone') },
        ],
        plots: {},
      },
    });
    expect(cropsFor(state, 'canteiro', NO_DEPOT).map((c) => c.id)).toEqual(['wood']);
    expect(cropsFor(state, 'muda', NO_DEPOT)).toEqual([]);
  });
});

describe('isReady', () => {
  it.each([
    { growthTenths: 29, ready: false },
    { growthTenths: 30, ready: true },
  ])('readyAt30Tenths: $growthTenths is $ready', ({ growthTenths, ready }) => {
    expect(isReady(common, { cropId: 'wood', growthTenths })).toBe(ready);
  });
});

const player: Actor = { role: 'player', characterId: 'thorin' };
const master: Actor = { role: 'master' };

const mint: Crop = {
  id: 'semente_hortela',
  seed: material('semente_hortela'),
  harvest: material('hortela'),
  plotType: 'canteiro',
  days: 3,
  yield: 4,
  rare: false,
  price: { bronze: 2 },
};
const moon: Crop = {
  id: 'semente_lunar',
  seed: material('semente_lunar'),
  harvest: material('flor_lunar'),
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
  cropId: 'semente_hortela',
  buy: false,
  ...overrides,
});

const grown = (cropId: string, days: number): Planting => ({ cropId, growthTenths: days * 10 });

function stateOf(result: StockedOutcome): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe('plant', () => {
  it('consumesOwnedSeed', () => {
    const state = stateOf(plant(plantingState({ seeds: 3 }), catalog, order(), player, NO_DEPOT));
    expect(stockOf(state, 'semente_hortela')).toBe(2);
    expect(state.garden.plots['canteiro-1']).toEqual({
      cropId: 'semente_hortela',
      growthTenths: 0,
    });
  });

  it('buysCommonSeedFromCamp', () => {
    const state = stateOf(
      plant(plantingState({}), catalog, order({ buy: true }), player, NO_DEPOT),
    );
    expect(state.wallets.camp).toEqual({ bronze: 8 });
    expect(stockOf(state, 'semente_hortela')).toBe(0);
    expect(state.garden.plots['canteiro-1']).toEqual({
      cropId: 'semente_hortela',
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
      plant(plantingState({ seeds: 1 }), catalog, order({ buy: true }), player, NO_DEPOT),
    );
    expect(state.wallets.camp).toEqual({ bronze: 10 });
    expect(stockOf(state, 'semente_hortela')).toBe(0);
  });

  it('refusesBuyWhenCampIsShort', () => {
    const start = plantingState({ camp: { bronze: 1 } });
    expect(plant(start, catalog, order({ buy: true }), player, NO_DEPOT)).toEqual({
      ok: false,
      error: 'insufficient_coins',
    });
    expect(start.garden.plots).toEqual({});
  });

  it('refusesRareWithoutSeed', () => {
    const result = plant(
      plantingState({}),
      catalog,
      order({ cropId: 'semente_lunar', buy: true }),
      player,
      NO_DEPOT,
    );
    expect(result).toEqual({ ok: false, error: 'rare_not_for_sale' });
  });

  it('refusesWithoutSeedAndNoBuy', () => {
    expect(plant(plantingState({}), catalog, order(), player, NO_DEPOT)).toEqual({
      ok: false,
      error: 'no_seed',
    });
  });

  it('masterPlantsForFree', () => {
    const state = stateOf(plant(plantingState({}), catalog, order(), master, NO_DEPOT));
    expect(state.wallets.camp).toEqual({ bronze: 10 });
    expect(state.garden.plots['canteiro-1']?.cropId).toBe('semente_hortela');
    expect(state.log.at(-1)).toMatchObject({ kind: 'garden_planted', bronze: 0 });
  });

  it('refusesWrongPlotType', () => {
    const result = plant(
      plantingState({ seeds: 1 }),
      catalog,
      order({ plotId: 'muda-1' }),
      player,
      NO_DEPOT,
    );
    expect(result).toEqual({ ok: false, error: 'wrong_plot_type' });
  });

  it('refusesOccupiedPlot', () => {
    const start = plantingState({
      seeds: 1,
      plots: { 'canteiro-1': { cropId: 'semente_lunar', growthTenths: 5 } },
    });
    expect(plant(start, catalog, order(), player, NO_DEPOT)).toEqual({
      ok: false,
      error: 'plot_occupied',
    });
  });

  it('refusesPlotAboveLevelInForce', () => {
    const result = plant(
      plantingState({ seeds: 1 }),
      catalog,
      order({ plotId: 'estufa-1' }),
      player,
      NO_DEPOT,
    );
    expect(result).toEqual({ ok: false, error: 'unknown_plot' });
  });

  it('refusesWithoutGarden', () => {
    const result = plant(plantingState({ level: 0, seeds: 1 }), catalog, order(), player, NO_DEPOT);
    expect(result).toEqual({ ok: false, error: 'garden_not_built' });
  });

  it('refusesUnknownCrop', () => {
    const result = plant(plantingState({}), catalog, order({ cropId: 'nope' }), master, NO_DEPOT);
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });

  it('refusesCropWhoseMaterialIsGone', () => {
    const result = plant(plantingState({ gone: ['hortela'] }), catalog, order(), master, NO_DEPOT);
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('harvest', () => {
  it('perennialResetsGrowth', () => {
    const start = plantingState({ plots: { 'canteiro-1': grown('semente_hortela', 3) } });
    const state = stateOf(harvest(start, catalog, 'canteiro-1', NO_DEPOT));
    expect(stockOf(state, 'hortela')).toBe(4);
    expect(state.garden.plots['canteiro-1']).toEqual({
      cropId: 'semente_hortela',
      growthTenths: 0,
    });
  });

  it('rareEmptiesPlot', () => {
    const start = plantingState({ plots: { 'canteiro-1': grown('semente_lunar', 5) } });
    const state = stateOf(harvest(start, catalog, 'canteiro-1', NO_DEPOT));
    expect(stockOf(state, 'flor_lunar')).toBe(1);
    expect(state.garden.plots).toEqual({});
  });

  it('refusesGrowingPlot', () => {
    const start = plantingState({
      plots: { 'canteiro-1': { cropId: 'semente_hortela', growthTenths: 29 } },
    });
    expect(harvest(start, catalog, 'canteiro-1', NO_DEPOT)).toEqual({
      ok: false,
      error: 'not_ready',
    });
  });

  it('refusesEmptyPlot', () => {
    expect(harvest(plantingState({}), catalog, 'canteiro-1', NO_DEPOT)).toEqual({
      ok: false,
      error: 'plot_empty',
    });
  });

  it('refusesUnknownPlot', () => {
    expect(harvest(plantingState({}), catalog, 'nope', NO_DEPOT)).toEqual({
      ok: false,
      error: 'unknown_plot',
    });
  });

  it('harvestAllSkipsGrowingAndEmpty', () => {
    const start = plantingState({
      plots: {
        'canteiro-1': grown('semente_hortela', 3),
        'canteiro-2': { cropId: 'semente_hortela', growthTenths: 10 },
        'canteiro-3': grown('semente_lunar', 5),
      },
    });
    const state = stateOf(harvest(start, catalog, undefined, NO_DEPOT));
    expect(stockOf(state, 'hortela')).toBe(4);
    expect(stockOf(state, 'flor_lunar')).toBe(1);
    expect(state.garden.plots).toEqual({
      'canteiro-1': { cropId: 'semente_hortela', growthTenths: 0 },
      'canteiro-2': { cropId: 'semente_hortela', growthTenths: 10 },
    });
  });

  it('harvestAllWithNothingReady', () => {
    const start = plantingState({
      plots: { 'canteiro-1': { cropId: 'semente_hortela', growthTenths: 10 } },
    });
    expect(harvest(start, catalog, undefined, NO_DEPOT)).toEqual({
      ok: false,
      error: 'nothing_changed',
    });
  });

  it('harvestsMissingMaterialAsNothing', () => {
    const start = plantingState({
      gone: ['hortela'],
      plots: { 'canteiro-1': grown('semente_hortela', 3) },
    });
    const state = stateOf(harvest(start, catalog, 'canteiro-1', NO_DEPOT));
    expect(state.garden.plots['canteiro-1']).toEqual({
      cropId: 'semente_hortela',
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
    const state = stateOf(harvest(start, catalog, undefined, NO_DEPOT));
    expect(state.log).toMatchObject([
      { kind: 'garden_harvested', material: 'hortela', quantity: 8 },
    ]);
  });

  it('ignoresPlotTypeEditedAfterPlanting', () => {
    const start = plantingState({
      plots: { 'canteiro-1': grown('semente_hortela', 3) },
      crops: [{ ...mint, plotType: 'muda' }, moon],
    });
    expect(harvest(start, catalog, 'canteiro-1', NO_DEPOT).ok).toBe(true);
  });
});

describe('clearPlot', () => {
  it('emptiesWithoutHarvestOrSeedBack', () => {
    const start = plantingState({
      seeds: 1,
      plots: { 'canteiro-1': grown('semente_hortela', 3) },
    });
    const state = stateOf(clearPlot(start, catalog, 'canteiro-1', NO_DEPOT));
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
    expect(clearPlot(plantingState({}), catalog, 'canteiro-1', NO_DEPOT)).toEqual({
      ok: false,
      error: 'plot_empty',
    });
  });

  it('clearsWhenSeedMaterialIsGone', () => {
    const start = plantingState({
      gone: ['semente_hortela'],
      plots: { 'canteiro-1': grown('semente_hortela', 3) },
    });
    expect(stateOf(clearPlot(start, catalog, 'canteiro-1', NO_DEPOT)).garden.plots).toEqual({});
  });
});

describe('growGarden', () => {
  const planted = () =>
    plantingState({ plots: { 'canteiro-1': { cropId: 'semente_hortela', growthTenths: 0 } } });
  const readyAfter = (days: number) => {
    const state = advanceDays(planted(), catalog, days, NO_DEPOT).state;
    const planting = state.garden.plots['canteiro-1'];
    const crop = findCrop(state, 'semente_hortela');
    return planting && crop ? isReady(crop, planting) : false;
  };

  it('growsOneDayPerDay', () => {
    expect(readyAfter(2)).toBe(false);
    expect(readyAfter(3)).toBe(true);
  });

  it('keepsGrowingReadyPlantings', () => {
    const start = plantingState({ plots: { 'canteiro-1': grown('semente_hortela', 3) } });
    expect(growGarden(start, catalog).garden.plots['canteiro-1']?.growthTenths).toBe(40);
  });

  it('doesNotGrowPlotsOutOfForce', () => {
    const start = plantingState({
      plots: { 'canteiro-x-1': { cropId: 'semente_hortela', growthTenths: 0 } },
    });
    expect(growGarden(start, catalog).garden.plots['canteiro-x-1']?.growthTenths).toBe(0);
  });
});

describe('settleGarden', () => {
  const estufaHerb: Crop = { ...mint, plotType: 'estufa' };
  const atLevel3 = (plots: Record<string, Planting>, seeds = 0) =>
    plantingState({ level: 3, seeds, crops: [estufaHerb, moon], plots });

  it('harvestsReadyPlantingAndFreesThePlot', () => {
    const state = settleGarden(
      atLevel3({ 'estufa-2': grown('semente_hortela', 3) }),
      catalog,
      NO_DEPOT,
    ).state;
    expect(state.garden.plots).toEqual({});
    expect(stockOf(state, 'hortela')).toBe(4);
    expect(state.log.at(-1)).toMatchObject({ kind: 'garden_harvested', quantity: 4 });
  });

  it('harvestsReadyRareCropOnceAndFreesThePlot', () => {
    const rare: Crop = { ...moon, plotType: 'estufa' };
    const start = plantingState({
      level: 3,
      crops: [rare],
      plots: { 'estufa-2': grown('semente_lunar', 5) },
    });
    const state = settleGarden(start, catalog, NO_DEPOT).state;
    expect(state.garden.plots).toEqual({});
    expect(stockOf(state, 'flor_lunar')).toBe(1);
  });

  it('movesGrowingPlantingToFreePlotKeepingGrowth', () => {
    const state = settleGarden(
      atLevel3({ 'estufa-2': { cropId: 'semente_hortela', growthTenths: 10 } }),
      catalog,
      NO_DEPOT,
    ).state;
    expect(state.garden.plots).toEqual({
      'estufa-1': { cropId: 'semente_hortela', growthTenths: 10 },
    });
    expect(state.log).toEqual([]);
  });

  it('returnsSeedWhenNoPlotIsFree', () => {
    const start = atLevel3(
      {
        'estufa-1': { cropId: 'semente_hortela', growthTenths: 0 },
        'estufa-2': { cropId: 'semente_hortela', growthTenths: 10 },
      },
      1,
    );
    const state = settleGarden(start, catalog, NO_DEPOT).state;
    expect(state.garden.plots).toEqual({
      'estufa-1': { cropId: 'semente_hortela', growthTenths: 0 },
    });
    expect(stockOf(state, 'semente_hortela')).toBe(2);
    expect(state.log.at(-1)).toMatchObject({
      kind: 'garden_seed_returned',
      seed: 'semente hortela',
      quantity: 1,
    });
  });

  it('returnsNothingWhenSeedMaterialIsGone', () => {
    const start = plantingState({
      level: 3,
      gone: ['semente_hortela'],
      crops: [estufaHerb],
      plots: {
        'estufa-1': { cropId: 'semente_hortela', growthTenths: 0 },
        'estufa-2': { cropId: 'semente_hortela', growthTenths: 10 },
      },
    });
    const state = settleGarden(start, catalog, NO_DEPOT).state;
    expect(Object.keys(state.garden.plots)).toEqual(['estufa-1']);
    expect(state.log).toEqual([]);
  });

  it('dropsPlantingsWhoseCropIsGone', () => {
    const start = plantingState({
      level: 3,
      crops: [],
      plots: { 'estufa-2': { cropId: 'semente_hortela', growthTenths: 10 } },
    });
    const state = settleGarden(start, catalog, NO_DEPOT).state;
    expect(state.garden.plots).toEqual({});
    expect(state.log).toEqual([]);
  });

  it('movesTwoPlantingsToDifferentPlots', () => {
    const start = plantingState({
      level: 1,
      plots: {
        'canteiro-x-1': { cropId: 'semente_hortela', growthTenths: 10 },
        'canteiro-x-2': { cropId: 'semente_hortela', growthTenths: 20 },
        'canteiro-1': { cropId: 'semente_hortela', growthTenths: 0 },
      },
    });
    const state = settleGarden(start, catalog, NO_DEPOT).state;
    expect(state.garden.plots).toEqual({
      'canteiro-1': { cropId: 'semente_hortela', growthTenths: 0 },
      'canteiro-2': { cropId: 'semente_hortela', growthTenths: 10 },
      'canteiro-3': { cropId: 'semente_hortela', growthTenths: 20 },
    });
  });

  it('movesUsingTheCropsCurrentPlotType', () => {
    const start = plantingState({
      level: 1,
      crops: [{ ...mint, plotType: 'muda' }],
      plots: { 'canteiro-x-1': { cropId: 'semente_hortela', growthTenths: 10 } },
    });
    expect(Object.keys(settleGarden(start, catalog, NO_DEPOT).state.garden.plots)).toEqual([
      'muda-1',
    ]);
  });

  it('settlesNothingWhenEveryPlotIsInForce', () => {
    const start = plantingState({ plots: { 'canteiro-1': grown('semente_hortela', 3) } });
    expect(settleGarden(start, catalog, NO_DEPOT).state).toBe(start);
  });

  it('settlesEveryPlotWhenTheGardenIsGone', () => {
    const start = plantingState({
      level: 0,
      plots: {
        'canteiro-1': grown('semente_hortela', 3),
        'canteiro-2': { cropId: 'semente_hortela', growthTenths: 10 },
      },
    });
    const state = settleGarden(start, catalog, NO_DEPOT).state;
    expect(state.garden.plots).toEqual({});
    expect(stockOf(state, 'hortela')).toBe(4);
    expect(stockOf(state, 'semente_hortela')).toBe(1);
  });
});

describe('garden with depot items', () => {
  const NOW = '2026-10-19T12:00:00.000Z';
  const view = (id: string, name: string, quantity: number, live = true) => ({
    id,
    name,
    quantity,
    live,
    updatedAt: NOW,
  });
  const depotMint: Crop = { ...mint, id: 'crop_hortela', seed: item('sem'), harvest: item('erva') };
  const depot = (seeds: number, herbLive = true): DepotSnapshot => [
    view('sem', 'Semente de Hortelã', seeds),
    view('erva', 'Hortelã', 0, herbLive),
  ];
  const start = (plots: Record<string, Planting> = {}) =>
    plantingState({ crops: [depotMint, moon], plots });
  const depotOrder = (overrides: Partial<PlantOrder> = {}) =>
    order({ cropId: 'crop_hortela', ...overrides });

  function stockedOf(result: StockedOutcome) {
    if (!result.ok) throw new Error(result.error);
    return result;
  }

  it('addsCropLinkedToExistingItems', () => {
    const result = stockedOf(addCrop(makeState(), catalog, depotMint, depot(0)));
    expect(result.state.garden.crops).toEqual([depotMint]);
    expect(result.stock).toEqual([]);
  });

  it.each([
    { name: 'an unknown item', snapshot: [view('erva', 'Hortelã', 0)] },
    { name: 'a trashed item', snapshot: depot(0, false) },
  ])('refusesCropWith $name', ({ snapshot }) => {
    expect(addCrop(makeState(), catalog, depotMint, snapshot)).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('refusesSecondCropForTheSameDepotSeed', () => {
    const first = stockedOf(addCrop(makeState(), catalog, depotMint, depot(0)));
    const again = { ...depotMint, id: 'crop_outra' };
    expect(addCrop(first.state, catalog, again, depot(0))).toEqual({
      ok: false,
      error: 'crop_already_exists',
    });
  });

  it('refusesSwitchingToASeedAnotherCropUses', () => {
    const state = plantingState({ crops: [depotMint, moon] });
    expect(
      updateCrop(state, catalog, 'semente_lunar', { ...moon, seed: item('sem') }, depot(0)),
    ).toEqual({ ok: false, error: 'crop_already_exists' });
  });

  it('hidesCropsWhoseItemIsGone', () => {
    const state = start();
    expect(cropsFor(state, 'canteiro', depot(1)).map((c) => c.id)).toEqual([
      'crop_hortela',
      'semente_lunar',
    ]);
    expect(cropsFor(state, 'canteiro', depot(1, false)).map((c) => c.id)).toEqual([
      'semente_lunar',
    ]);
  });

  it('playerSpendsADepotSeedStrictly', () => {
    const result = stockedOf(plant(start(), catalog, depotOrder(), player, depot(2)));
    expect(result.stock).toEqual([{ itemId: 'sem', delta: -1, mode: 'strict' }]);
    expect(result.state.materials).toEqual(start().materials);
    expect(result.state.garden.plots['canteiro-1']).toEqual({
      cropId: 'crop_hortela',
      growthTenths: 0,
    });
    expect(result.state.log.at(-1)).toMatchObject({
      kind: 'garden_planted',
      seed: 'Semente de Hortelã',
      bronze: 0,
    });
  });

  it('refusesPlayerWithoutDepotSeed', () => {
    expect(plant(start(), catalog, depotOrder(), player, depot(0))).toEqual({
      ok: false,
      error: 'no_seed',
    });
  });

  it('buysTheSeedWhenTheItemIsEmpty', () => {
    const result = stockedOf(plant(start(), catalog, depotOrder({ buy: true }), player, depot(0)));
    expect(result.stock).toEqual([]);
    expect(result.state.wallets.camp).toEqual({ bronze: 8 });
  });

  it('masterClampsTheSeedSpend', () => {
    const result = stockedOf(plant(start(), catalog, depotOrder(), master, depot(0)));
    expect(result.stock).toEqual([{ itemId: 'sem', delta: -1, mode: 'clamp' }]);
  });

  it('harvestsIntoTheDepotItem', () => {
    const planted = start({ 'canteiro-1': grown('crop_hortela', 3) });
    const result = stockedOf(harvest(planted, catalog, 'canteiro-1', depot(0)));
    expect(result.stock).toEqual([{ itemId: 'erva', delta: 4, mode: 'strict' }]);
    expect(result.state.log).toEqual([
      { day: 1, kind: 'garden_harvested', material: 'Hortelã', quantity: 4 },
    ]);
  });

  it('logsAHarvestForATrashedItemAsLost', () => {
    const planted = start({ 'canteiro-1': grown('crop_hortela', 3) });
    const result = stockedOf(harvest(planted, catalog, 'canteiro-1', depot(0, false)));
    expect(result.stock).toEqual([]);
    expect(result.state.log).toEqual([
      { day: 1, kind: 'garden_harvested', material: 'Hortelã', quantity: 4, lost: true },
    ]);
  });

  it('keepsTheLoggedNameWhenTheItemIsRenamedLater', () => {
    const planted = start({ 'canteiro-1': grown('crop_hortela', 3) });
    const first = stockedOf(harvest(planted, catalog, 'canteiro-1', depot(0)));
    const renamed: DepotSnapshot = [view('erva', 'Menta', 4), view('sem', 'Semente', 0)];
    const regrown = {
      ...first.state,
      garden: { ...first.state.garden, plots: planted.garden.plots },
    };
    const second = stockedOf(harvest(regrown, catalog, 'canteiro-1', renamed));
    expect(second.state.log.map((e) => (e.kind === 'garden_harvested' ? e.material : ''))).toEqual([
      'Hortelã',
      'Menta',
    ]);
  });

  it('settleRefundsTheSeedToTheItem', () => {
    const vanished = plantingState({
      level: 0,
      crops: [depotMint],
      plots: { 'canteiro-1': { cropId: 'crop_hortela', growthTenths: 10 } },
    });
    const settled = settleGarden(vanished, catalog, depot(0));
    expect(settled.stock).toEqual([{ itemId: 'sem', delta: 1, mode: 'strict' }]);
    expect(settled.state.log.at(-1)).toMatchObject({
      kind: 'garden_seed_returned',
      seed: 'Semente de Hortelã',
    });
  });

  it('clearsNamingTheDepotSeed', () => {
    const planted = start({ 'canteiro-1': grown('crop_hortela', 1) });
    const result = stockedOf(clearPlot(planted, catalog, 'canteiro-1', depot(0)));
    expect(result.state.log.at(-1)).toMatchObject({
      kind: 'garden_cleared',
      seed: 'Semente de Hortelã',
    });
  });
});
