import { describe, expect, it } from 'vitest';
import { t } from '../../i18n/pt-BR';
import type { Actor } from '../../commands/schema';
import { ARCANE_LAB_BUILDING_ID } from '../../model/catalog';
import type { Brew, GameState, Recipe } from '../../model/schema';
import { arcaneLabCatalog as catalog, makeState } from '../../systems/testFixtures';
import {
  labSummary,
  lockedStations,
  recipeOptions,
  stationAria,
  stationViews,
  visibleTabs,
} from './labViews';

const player: Actor = { role: 'player', characterId: 'thorin' };
const master: Actor = { role: 'master' };

const cura: Recipe = {
  id: 'r-cura',
  output: { source: 'material', materialId: 'cura' },
  outputQty: 2,
  ingredients: [
    { ref: { source: 'material', materialId: 'hortela' }, quantity: 3 },
    { ref: { source: 'material', materialId: 'camomila' }, quantity: 1 },
  ],
  stationType: 'alambique',
  days: 2,
  hidden: false,
};

const brewOf = (progressTenths: number): Brew => ({
  recipeId: 'r-cura',
  output: { source: 'material', materialId: 'cura' },
  outputQty: 2,
  days: 2,
  spent: cura.ingredients,
  progressTenths,
});

function labState(
  level: number,
  stations: Record<string, Brew> = {},
  stock: Record<string, number> = {},
): GameState {
  const base = makeState({
    slots:
      level === 0 ? {} : { outer_n: { buildingId: ARCANE_LAB_BUILDING_ID, level, status: 'done' } },
  });
  const herbs = [
    { id: 'hortela', name: 'Hortelã', category: 'ores', quantity: 0 },
    { id: 'camomila', name: 'Camomila', category: 'ores', quantity: 0 },
    { id: 'cura', name: 'Poção de Cura', category: 'ores', quantity: 0 },
  ].map((m) => ({ ...m, quantity: stock[m.id] ?? 0 }));
  return {
    ...base,
    materials: { ...base.materials, items: [...base.materials.items, ...herbs] },
    lab: { recipes: [cura], stations },
  };
}

describe('stationViews', () => {
  it('describesFreeBrewingAndReadyStations', () => {
    const views = stationViews(
      labState(1, { 'alambique-1': brewOf(5), 'alambique-2': brewOf(20) }),
      catalog,
      [],
    );
    expect(views.map((v) => [v.station.id, v.kind])).toEqual([
      ['alambique-1', 'brewing'],
      ['alambique-2', 'ready'],
    ]);
    expect(views[0]).toMatchObject({ potionName: 'Poção de Cura', daysLeft: 2, progress: 0.25 });
  });

  it('countsTheSummary', () => {
    const views = stationViews(labState(2, { 'alambique-2': brewOf(20) }), catalog, []);
    expect(labSummary(views)).toEqual({ ready: 1, brewing: 0, free: 3 });
  });

  it('namesAPotionThatIsGoneAsRemoved', () => {
    const state = labState(1, {
      'alambique-1': { ...brewOf(5), output: { source: 'material', materialId: 'gone' } },
    });
    expect(stationViews(state, catalog, [])[0]).toMatchObject({ potionName: t.garden.missingItem });
  });
});

describe('stationAria', () => {
  it.each([
    { stations: {}, label: 'Alambique 1: livre. Preparar.' },
    { stations: { 'alambique-1': brewOf(5) }, label: 'Alambique 1: Poção de Cura, faltam 2 dias' },
    { stations: { 'alambique-1': brewOf(15) }, label: 'Alambique 1: Poção de Cura, falta 1 dia' },
    {
      stations: { 'alambique-1': brewOf(20) },
      label: 'Alambique 1: Poção de Cura pronta. Recolher 2.',
    },
  ])('labels $label', ({ stations, label }) => {
    const [view] = stationViews(labState(1, stations), catalog, []);
    if (!view) throw new Error('no station');
    expect(stationAria(view)).toBe(label);
  });
});

describe('lockedStations', () => {
  it('lockedStationsShowUnlockLevel', () => {
    expect(lockedStations(catalog.lab.levels, 1).map((l) => [l.station.id, l.level])).toEqual([
      ['alambique-3', 2],
      ['caldeirao-1', 2],
      ['alambique-4', 3],
      ['caldeirao-2', 3],
      ['circulo-1', 3],
    ]);
  });

  it('showsNothingLockedAtTheTopLevel', () => {
    expect(lockedStations(catalog.lab.levels, 3)).toEqual([]);
  });
});

describe('recipeOptions', () => {
  it('comparesStockToTheRecipe', () => {
    const [option] = recipeOptions(labState(1, {}, { hortela: 2, camomila: 1 }), 'alambique', {
      actor: player,
      depot: [],
    });
    expect(option).toMatchObject({
      outputName: 'Poção de Cura',
      canBrew: false,
      missing: ['Hortelã'],
      ingredients: [
        { name: 'Hortelã', have: 2, need: 3, missing: true },
        { name: 'Camomila', have: 1, need: 1, missing: false },
      ],
    });
  });

  it('letsAPlayerBrewWithEveryIngredient', () => {
    const [option] = recipeOptions(labState(1, {}, { hortela: 3, camomila: 1 }), 'alambique', {
      actor: player,
      depot: [],
    });
    expect(option).toMatchObject({ canBrew: true, missing: [] });
  });

  it('masterCanBrewWithoutStock', () => {
    const [option] = recipeOptions(labState(1), 'alambique', { actor: master, depot: [] });
    expect(option).toMatchObject({ canBrew: true, missing: ['Hortelã', 'Camomila'] });
  });

  it('badgesHerbFromGarden', () => {
    const state = labState(1);
    const withCrop: GameState = {
      ...state,
      garden: {
        crops: [
          {
            id: 'wood',
            seed: { source: 'material', materialId: 'wood' },
            harvest: { source: 'material', materialId: 'hortela' },
            plotType: 'canteiro',
            days: 2,
            yield: 3,
            rare: true,
          },
        ],
        plots: {},
      },
    };
    const [option] = recipeOptions(withCrop, 'alambique', { actor: player, depot: [] });
    expect(option?.ingredients.map((i) => i.fromGarden)).toEqual([true, false]);
  });

  it('playerTrayEmptyWhenAllHidden', () => {
    const state = labState(1);
    const hidden = { ...state, lab: { ...state.lab, recipes: [{ ...cura, hidden: true }] } };
    expect(recipeOptions(hidden, 'alambique', { actor: player, depot: [] })).toEqual([]);
    expect(recipeOptions(hidden, 'alambique', { actor: master, depot: [] })).toMatchObject([
      { hidden: true },
    ]);
  });
});

describe('visibleTabs', () => {
  it.each([
    { isMaster: true, tabs: ['lab', 'recipes'] },
    { isMaster: false, tabs: [] },
  ])('master $isMaster sees $tabs', ({ isMaster, tabs }) => {
    expect(visibleTabs(isMaster)).toEqual(tabs);
  });
});
