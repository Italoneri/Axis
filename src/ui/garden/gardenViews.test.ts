import { describe, expect, it } from 'vitest';
import type { Actor } from '../../commands/schema';
import { HERB_GARDEN_BUILDING_ID } from '../../model/catalog';
import type { Crop, GameState, PlacedBuilding } from '../../model/schema';
import { herbGardenCatalog as catalog, makeState, withCamp } from '../../systems/testFixtures';
import { gardenSummary, plotViews, seedOptions } from './gardenViews';

const placed = {
  buildingId: HERB_GARDEN_BUILDING_ID,
  level: 1,
  status: 'done',
  startedOnDay: 1,
  completesOnDay: 1,
} as PlacedBuilding;

const common: Crop = {
  seedId: 'wood',
  harvestId: 'iron',
  plotType: 'canteiro',
  days: 3,
  yield: 2,
  rare: false,
  price: { bronze: 2 },
};
const rare: Crop = {
  seedId: 'aetherium',
  harvestId: 'iron',
  plotType: 'canteiro',
  days: 5,
  yield: 1,
  rare: true,
};

const player: Actor = { role: 'player', characterId: 'thorin' };
const master: Actor = { role: 'master' };

function gardenWith(
  plots: GameState['garden']['plots'],
  crops: Crop[] = [common],
  overrides: Partial<GameState> = {},
): GameState {
  return makeState({
    slots: { outer_n: placed },
    garden: { crops, plots },
    ...overrides,
  });
}

function withSeeds(state: GameState, stock: Record<string, number>): GameState {
  const items = state.materials.items.map((m) => ({ ...m, quantity: stock[m.id] ?? m.quantity }));
  return { ...state, materials: { ...state.materials, items } };
}

describe('plotViews', () => {
  it('daysLeftRoundsUp', () => {
    const state = gardenWith({ 'canteiro-1': { seedId: 'wood', growthTenths: 15 } });
    const view = plotViews(state, catalog).find((v) => v.plot.id === 'canteiro-1');
    expect(view).toMatchObject({
      kind: 'growing',
      daysLeft: 2,
      progress: 0.5,
      harvestName: 'Ferro',
    });
  });

  it('marksReadyPlantings', () => {
    const state = gardenWith({ 'canteiro-1': { seedId: 'wood', growthTenths: 30 } });
    const view = plotViews(state, catalog).find((v) => v.plot.id === 'canteiro-1');
    expect(view).toMatchObject({ kind: 'ready', harvestName: 'Ferro' });
  });

  it('listsEveryPlotInForce', () => {
    expect(plotViews(gardenWith({}), catalog)).toHaveLength(8);
    expect(plotViews(makeState(), catalog)).toEqual([]);
  });
});

describe('gardenSummary', () => {
  it('summaryCountsEachState', () => {
    const state = gardenWith({
      'canteiro-1': { seedId: 'wood', growthTenths: 30 },
      'canteiro-2': { seedId: 'wood', growthTenths: 40 },
      'canteiro-3': { seedId: 'wood', growthTenths: 10 },
    });
    expect(gardenSummary(plotViews(state, catalog))).toEqual({ ready: 2, growing: 1, empty: 5 });
  });
});

describe('seedOptions', () => {
  it('listsSeedsWithZeroStock', () => {
    const options = seedOptions(gardenWith({}, [common, rare]), catalog, 'canteiro', player);
    expect(options.map((o) => [o.seedName, o.owned])).toEqual([
      ['Aetherium', 0],
      ['Madeira', 0],
    ]);
  });

  it('ignoresCropsOfOtherPlotTypes', () => {
    const state = gardenWith({}, [{ ...common, plotType: 'muda' }]);
    expect(seedOptions(state, catalog, 'canteiro', player)).toEqual([]);
  });

  it.each([
    { name: 'owned seed', actor: player, stock: { wood: 1 }, crop: common, action: 'plant' },
    { name: 'common at 0', actor: player, stock: {}, crop: common, action: 'buy' },
    { name: 'rare at 0', actor: player, stock: {}, crop: rare, action: 'rare_locked' },
    { name: 'master rare at 0', actor: master, stock: {}, crop: rare, action: 'plant' },
    { name: 'owned rare', actor: player, stock: { aetherium: 1 }, crop: rare, action: 'plant' },
  ] as const)('seedOptionActions: $name is $action', ({ actor, stock, crop, action }) => {
    const state = withSeeds(gardenWith({}, [crop]), stock);
    expect(seedOptions(state, catalog, 'canteiro', actor)[0]?.action).toBe(action);
  });

  it('seedOptionDisabledWhenCampIsShort', () => {
    const state = withCamp({ bronze: 1 }, gardenWith({}));
    const [option] = seedOptions(state, catalog, 'canteiro', player);
    expect(option).toMatchObject({ action: 'camp_short', priceBronze: 2, shortBronze: 1 });
  });

  it('showsPriceWhenCampCanPay', () => {
    const [option] = seedOptions(gardenWith({}), catalog, 'canteiro', player);
    expect(option).toMatchObject({ action: 'buy', priceBronze: 2, shortBronze: null });
  });
});
