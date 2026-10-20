import { describe, expect, it } from 'vitest';
import type { Brew, Crop, Recipe, StockRef } from '../model/schema';
import type { CropFields } from '../systems/Garden';
import { makeState } from '../systems/testFixtures';
import { depotItemsNeeded } from './depotItemsNeeded';

const item = (itemId: string): StockRef => ({ source: 'depot', itemId });
const material = (materialId: string): StockRef => ({ source: 'material', materialId });

const mintFields: CropFields = {
  seed: item('semente'),
  harvest: item('erva'),
  plotType: 'canteiro',
  days: 1,
  yield: 1,
  rare: true,
};
const mint: Crop = { ...mintFields, id: 'c-mint' };
const potion: Recipe = {
  id: 'r-cavalo',
  output: item('pocao'),
  outputQty: 1,
  ingredients: [
    { ref: item('erva'), quantity: 1 },
    { ref: material('iron'), quantity: 1 },
  ],
  stationType: 'alambique',
  days: 1,
  hidden: false,
};
const brewing: Brew = {
  recipeId: 'r-cavalo',
  output: item('pocao'),
  outputQty: 1,
  days: 1,
  spent: [{ ref: item('raiz'), quantity: 1 }],
  progressTenths: 0,
};
const state = makeState({
  garden: { crops: [mint], plots: { 'canteiro-1': { cropId: 'c-mint', growthTenths: 0 } } },
  lab: { recipes: [potion], stations: { 'alambique-1': brewing } },
});

describe('depotItemsNeeded', () => {
  it.each([
    {
      name: 'a crop form',
      command: { type: 'garden_crop_create', id: 'x', crop: mintFields },
      ids: ['semente', 'erva'],
    },
    {
      name: 'planting',
      command: { type: 'garden_plant', plotId: 'p', cropId: 'c-mint', buy: false },
      ids: ['semente', 'erva'],
    },
    { name: 'a harvest', command: { type: 'garden_harvest' }, ids: ['erva'] },
    { name: 'clearing', command: { type: 'garden_clear', plotId: 'canteiro-1' }, ids: ['semente'] },
    {
      name: 'brewing',
      command: { type: 'lab_brew', stationId: 's', recipeId: 'r-cavalo' },
      ids: ['pocao', 'erva'],
    },
    {
      name: 'collecting',
      command: { type: 'lab_collect', stationId: 'alambique-1' },
      ids: ['pocao'],
    },
    {
      name: 'advancing days',
      command: { type: 'advance_days', days: 1 },
      ids: ['semente', 'erva', 'pocao', 'raiz'],
    },
    {
      name: 'anything else',
      command: { type: 'deposit', characterId: 'thorin', coins: {} },
      ids: [],
    },
    { name: 'an invalid command', command: { type: 'nope' }, ids: [] },
  ])('readsOnlyTheItemsOf $name', ({ command, ids }) => {
    expect(depotItemsNeeded(state, command)).toEqual(ids);
  });
});
