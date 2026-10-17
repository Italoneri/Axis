import { describe, expect, it } from 'vitest';
import { HERB_GARDEN_BUILDING_ID } from '../model/catalog';
import type { Crop, GameState, PlacedBuilding } from '../model/schema';
import {
  addCrop,
  cropsFor,
  findCrop,
  isReady,
  plotsInForce,
  removeCrop,
  updateCrop,
  type CropFields,
} from './Garden';
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
