import { describe, expect, it } from 'vitest';
import type { StockRef } from '../../model/schema';
import { itemLinks } from '../../systems/Stock';
import { makeState } from '../../systems/testFixtures';
import { linkLabels } from './depotViews';

const item = (itemId: string): StockRef => ({ source: 'depot', itemId });
const recipe = (id: string, output: StockRef, ingredient: StockRef) => ({
  id,
  output,
  outputQty: 1,
  ingredients: [{ ref: ingredient, quantity: 1 }],
  stationType: 'alambique' as const,
  days: 1,
  hidden: false,
});

describe('linkLabels', () => {
  it('namesTheCropsAndCountsTheRecipes', () => {
    const state = makeState({
      garden: {
        crops: [
          {
            id: 'c1',
            seed: item('semente'),
            harvest: item('erva'),
            plotType: 'canteiro',
            days: 1,
            yield: 1,
            rare: true,
          },
        ],
        plots: {},
      },
      lab: {
        recipes: [
          recipe('r1', { source: 'material', materialId: 'iron' }, item('semente')),
          recipe('r2', { source: 'material', materialId: 'wood' }, item('semente')),
        ],
        stations: {},
      },
    });
    const depot = [
      { id: 'erva', name: 'Hortelã', quantity: 0, live: true, updatedAt: 'x' },
      { id: 'semente', name: 'Semente', quantity: 0, live: true, updatedAt: 'x' },
    ];
    expect(linkLabels(state, itemLinks(state, 'semente'), depot)).toEqual([
      'Semente de Hortelã',
      'Ingrediente de 2 receitas',
    ]);
    expect(linkLabels(state, itemLinks(state, 'erva'), depot)).toEqual(['Colheita de Semente']);
  });
});
