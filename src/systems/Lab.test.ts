import { describe, expect, it } from 'vitest';
import { ARCANE_LAB_BUILDING_ID } from '../model/catalog';
import type { Actor } from '../commands/schema';
import type { Brew, GameState, PlacedBuilding, Recipe } from '../model/schema';
import {
  addRecipe,
  brew,
  brewLab,
  collect,
  discard,
  findRecipe,
  recipesFor,
  removeRecipe,
  settleLab,
  stationsInForce,
  updateRecipe,
  type RecipeFields,
} from './Lab';
import type { Outcome } from './outcome';
import { arcaneLabCatalog as catalog, makeState } from './testFixtures';

const placed = (level: number, status: PlacedBuilding['status'] = 'done'): PlacedBuilding =>
  ({
    buildingId: ARCANE_LAB_BUILDING_ID,
    level,
    status,
    startedOnDay: 1,
    completesOnDay: 5,
  }) as PlacedBuilding;

const herbs = [
  { id: 'hortela', name: 'Hortelã', category: 'ores', quantity: 0 },
  { id: 'camomila', name: 'Camomila', category: 'ores', quantity: 0 },
  { id: 'cura', name: 'Poção de Cura', category: 'ores', quantity: 0 },
  { id: 'mana', name: 'Elixir de Mana', category: 'ores', quantity: 0 },
];

/** A lab at `level` (0 = not built) with the herbs and potions as materials, at the given stock. */
function labState(
  level: number,
  { status = 'done', stock = {}, recipes = [] }: LabStateOptions = {},
): GameState {
  const base = makeState({ slots: level === 0 ? {} : { outer_n: placed(level, status) } });
  const items = [...base.materials.items, ...herbs].map((m) => ({
    ...m,
    quantity: stock[m.id] ?? m.quantity,
  }));
  return {
    ...base,
    materials: { ...base.materials, items },
    lab: { recipes, stations: {} },
  };
}

interface LabStateOptions {
  status?: PlacedBuilding['status'];
  stock?: Record<string, number>;
  recipes?: Recipe[];
}

const cura: Recipe = {
  id: 'r-cura',
  outputId: 'cura',
  outputQty: 2,
  ingredients: [
    { materialId: 'hortela', quantity: 3 },
    { materialId: 'camomila', quantity: 1 },
  ],
  stationType: 'alambique',
  days: 1,
  hidden: false,
};

const mana: Recipe = {
  id: 'r-mana',
  outputId: 'mana',
  outputQty: 3,
  ingredients: [{ materialId: 'aetherium', quantity: 1 }],
  stationType: 'caldeirao',
  days: 3,
  hidden: true,
};

const fieldsOf = (recipe: Recipe): RecipeFields => ({
  outputId: recipe.outputId,
  outputQty: recipe.outputQty,
  ingredients: recipe.ingredients,
  stationType: recipe.stationType,
  days: recipe.days,
  hidden: recipe.hidden,
});

describe('stationsInForce', () => {
  it.each([
    { level: 0, status: 'done', stations: [] },
    { level: 1, status: 'done', stations: ['alambique-1', 'alambique-2'] },
    {
      level: 2,
      status: 'done',
      stations: ['alambique-1', 'alambique-2', 'alambique-3', 'caldeirao-1'],
    },
    { level: 3, status: 'done', stations: 7 },
    { level: 2, status: 'building', stations: ['alambique-1', 'alambique-2'] },
  ] as const)('stationsFollowLevelInForce: $level ($status)', ({ level, status, stations }) => {
    const ids = stationsInForce(labState(level, { status }), catalog).map((s) => s.id);
    if (typeof stations === 'number') expect(ids).toHaveLength(stations);
    else expect(ids).toEqual(stations);
  });
});

describe('recipe catalog', () => {
  it('addsARecipe', () => {
    const outcome = addRecipe(labState(1), cura);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(findRecipe(outcome.state, 'r-cura')).toEqual(cura);
  });

  it.each([
    { name: 'unknown output', recipe: { ...cura, outputId: 'nope' }, error: 'not_found' },
    {
      name: 'unknown ingredient',
      recipe: { ...cura, ingredients: [{ materialId: 'nope', quantity: 1 }] },
      error: 'not_found',
    },
  ])('refuses $name', ({ recipe, error }) => {
    expect(addRecipe(labState(1), recipe)).toEqual({ ok: false, error });
  });

  it('refusesASecondRecipeWithTheSameId', () => {
    expect(addRecipe(labState(1, { recipes: [cura] }), cura)).toEqual({
      ok: false,
      error: 'recipe_already_exists',
    });
  });

  it('updatesARecipe', () => {
    const outcome = updateRecipe(labState(1, { recipes: [cura] }), 'r-cura', {
      ...fieldsOf(cura),
      days: 4,
      hidden: true,
    });
    if (!outcome.ok) throw new Error(outcome.error);
    expect(findRecipe(outcome.state, 'r-cura')).toEqual({ ...cura, days: 4, hidden: true });
  });

  it.each([
    { name: 'unknown recipe', recipeId: 'nope', fields: fieldsOf(cura) },
    { name: 'unknown output', recipeId: 'r-cura', fields: { ...fieldsOf(cura), outputId: 'x' } },
    {
      name: 'unknown ingredient',
      recipeId: 'r-cura',
      fields: { ...fieldsOf(cura), ingredients: [{ materialId: 'x', quantity: 1 }] },
    },
  ])('refusesUpdateWith $name', ({ recipeId, fields }) => {
    expect(updateRecipe(labState(1, { recipes: [cura] }), recipeId, fields)).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('removesARecipe', () => {
    const outcome = removeRecipe(labState(1, { recipes: [cura, mana] }), 'r-cura');
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.state.lab.recipes).toEqual([mana]);
  });

  it('refusesRemovingAnUnknownRecipe', () => {
    expect(removeRecipe(labState(1), 'nope')).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('recipesFor', () => {
  const tonico: Recipe = { ...cura, id: 'r-tonico', outputId: 'mana', hidden: false };
  const recipes = [cura, tonico, mana];
  const ids = (list: readonly Recipe[]) => list.map((r) => r.id);

  it('listsTheStationTypeSortedByOutputName', () => {
    expect(ids(recipesFor(labState(1, { recipes }), 'alambique', false))).toEqual([
      'r-tonico',
      'r-cura',
    ]);
  });

  it('hidesRecipesWhoseMaterialIsGone', () => {
    const state = labState(1, { recipes });
    const withoutCamomila = {
      ...state,
      materials: {
        ...state.materials,
        items: state.materials.items.filter((m) => m.id !== 'camomila'),
      },
    };
    expect(recipesFor(withoutCamomila, 'alambique', true)).toEqual([]);
  });

  it('hidesHiddenRecipesFromPlayers', () => {
    expect(recipesFor(labState(2, { recipes }), 'caldeirao', false)).toEqual([]);
  });

  it('masterSeesHiddenRecipes', () => {
    expect(ids(recipesFor(labState(2, { recipes }), 'caldeirao', true))).toEqual(['r-mana']);
  });
});

const player: Actor = { role: 'player', characterId: 'thorin' };
const master: Actor = { role: 'master' };
const stockOf = (state: GameState, id: string) =>
  state.materials.items.find((m) => m.id === id)?.quantity;
const stateOf = (outcome: Outcome): GameState => {
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.state;
};

/** The copy a station keeps of `cura` once brewed with the full recipe. */
const curaBrew = (progressTenths: number): Brew => ({
  recipeId: 'r-cura',
  outputId: 'cura',
  outputQty: 2,
  days: 1,
  spent: cura.ingredients,
  progressTenths,
});

const withStations = (state: GameState, stations: Record<string, Brew>): GameState => ({
  ...state,
  lab: { ...state.lab, stations },
});

describe('brew', () => {
  const stocked = { hortela: 5, camomila: 1, aetherium: 2 };
  const order = { stationId: 'alambique-1', recipeId: 'r-cura' };
  const brewed = (state: GameState) => stateOf(brew(state, catalog, order, player));

  it('brewsWithEveryIngredient', () => {
    const state = brewed(labState(1, { stock: stocked, recipes: [cura] }));
    expect(state.lab.stations['alambique-1']).toEqual(curaBrew(0));
    expect(stockOf(state, 'hortela')).toBe(2);
    expect(stockOf(state, 'camomila')).toBe(0);
    expect(state.log.at(-1)).toEqual({
      day: 1,
      kind: 'lab_brewed',
      station: 'alambique-1',
      material: 'Poção de Cura',
      ingredients: [
        { material: 'Hortelã', quantity: 3 },
        { material: 'Camomila', quantity: 1 },
      ],
    });
  });

  it('brewSpendsAllOrNothing', () => {
    const start = labState(1, { stock: { hortela: 5 }, recipes: [cura] });
    expect(brew(start, catalog, order, player)).toEqual({
      ok: false,
      error: 'missing_ingredients',
    });
  });

  it('masterBrewsWithoutStock', () => {
    const start = labState(1, { stock: { hortela: 2 }, recipes: [cura] });
    const state = stateOf(brew(start, catalog, order, master));
    expect(state.lab.stations['alambique-1']?.spent).toEqual([
      { materialId: 'hortela', quantity: 2 },
    ]);
    expect(stockOf(state, 'hortela')).toBe(0);
  });

  it('playerCannotBrewHiddenRecipe', () => {
    const start = labState(1, { stock: stocked, recipes: [{ ...cura, hidden: true }] });
    expect(brew(start, catalog, order, player)).toEqual({ ok: false, error: 'not_found' });
  });

  it('masterBrewsHiddenRecipe', () => {
    const start = labState(1, { stock: stocked, recipes: [{ ...cura, hidden: true }] });
    expect(brew(start, catalog, order, master).ok).toBe(true);
  });

  it.each([
    { name: 'lab not built', level: 0, order, error: 'lab_not_built' },
    {
      name: 'refusesStationAboveLevelInForce',
      level: 1,
      order: { stationId: 'caldeirao-1', recipeId: 'r-mana' },
      error: 'unknown_station',
    },
    { name: 'unknown recipe', level: 1, order: { ...order, recipeId: 'nope' }, error: 'not_found' },
    {
      name: 'wrong station type',
      level: 2,
      order: { stationId: 'caldeirao-1', recipeId: 'r-cura' },
      error: 'wrong_station_type',
    },
  ])('refuses: $name', ({ level, order, error }) => {
    const start = labState(level, { stock: stocked, recipes: [cura, mana] });
    expect(brew(start, catalog, order, master)).toEqual({ ok: false, error });
  });

  it('refusesBusyStation', () => {
    const start = withStations(labState(1, { stock: stocked, recipes: [cura] }), {
      'alambique-1': curaBrew(0),
    });
    expect(brew(start, catalog, order, player)).toEqual({ ok: false, error: 'station_busy' });
  });

  it('refusesStationAboveLevelInForceDuringUpgrade', () => {
    const start = labState(2, {
      status: 'building',
      stock: stocked,
      recipes: [{ ...mana, hidden: false }],
    });
    const order = { stationId: 'caldeirao-1', recipeId: 'r-mana' };
    expect(brew(start, catalog, order, player)).toEqual({ ok: false, error: 'unknown_station' });
  });

  it('editingRecipeKeepsRunningBrew', () => {
    const brewing = brewed(labState(1, { stock: stocked, recipes: [cura] }));
    const fields = { ...fieldsOf(cura), outputQty: 9, days: 7 };
    const edited = stateOf(updateRecipe(brewing, 'r-cura', fields));
    expect(edited.lab.stations['alambique-1']).toEqual(curaBrew(0));
  });

  it('hidingRecipeKeepsRunningBrew', () => {
    const brewing = brewed(labState(1, { stock: stocked, recipes: [cura] }));
    const fields = { ...fieldsOf(cura), hidden: true };
    const hidden = stateOf(updateRecipe(brewing, 'r-cura', fields));
    expect(hidden.lab.stations['alambique-1']).toEqual(curaBrew(0));
  });

  it('removingRecipeKeepsRunningBrew', () => {
    const brewing = brewed(labState(1, { stock: stocked, recipes: [cura] }));
    const removed = stateOf(removeRecipe(brewing, 'r-cura'));
    expect(removed.lab.stations['alambique-1']).toEqual(curaBrew(0));
    const ready = withStations(removed, { 'alambique-1': curaBrew(10) });
    expect(stockOf(stateOf(collect(ready, catalog, 'alambique-1')), 'cura')).toBe(2);
  });
});

describe('collect', () => {
  const ready = curaBrew(10);

  it('collectsAReadyStation', () => {
    const start = withStations(labState(1), { 'alambique-1': ready });
    const state = stateOf(collect(start, catalog, 'alambique-1'));
    expect(state.lab.stations).toEqual({});
    expect(stockOf(state, 'cura')).toBe(2);
    expect(state.log.at(-1)).toEqual({
      day: 1,
      kind: 'lab_collected',
      material: 'Poção de Cura',
      quantity: 2,
    });
  });

  it.each([
    {
      name: 'not ready',
      stations: { 'alambique-1': curaBrew(9) },
      stationId: 'alambique-1',
      error: 'not_ready',
    },
    { name: 'empty', stations: {}, stationId: 'alambique-1', error: 'station_empty' },
    { name: 'unknown station', stations: {}, stationId: 'circulo-1', error: 'unknown_station' },
  ])('refuses: $name', ({ stations, stationId, error }) => {
    expect(collect(withStations(labState(1), stations), catalog, stationId)).toEqual({
      ok: false,
      error,
    });
  });

  it('collectsMissingOutputAsNothing', () => {
    const start = withStations(labState(1), { 'alambique-1': { ...ready, outputId: 'gone' } });
    const state = stateOf(collect(start, catalog, 'alambique-1'));
    expect(state.lab.stations).toEqual({});
    expect(state.log).toEqual(start.log);
  });

  it('collectAllSkipsBrewingAndEmpty', () => {
    const start = withStations(labState(2), {
      'alambique-1': ready,
      'alambique-2': curaBrew(5),
      'alambique-3': ready,
    });
    const state = stateOf(collect(start, catalog, undefined));
    expect(Object.keys(state.lab.stations)).toEqual(['alambique-2']);
    expect(stockOf(state, 'cura')).toBe(4);
    expect(state.log.filter((e) => e.kind === 'lab_collected')).toEqual([
      { day: 1, kind: 'lab_collected', material: 'Poção de Cura', quantity: 4 },
    ]);
  });

  it('collectAllWithNothingReady', () => {
    const start = withStations(labState(1), { 'alambique-1': curaBrew(5) });
    expect(collect(start, catalog, undefined)).toEqual({ ok: false, error: 'nothing_changed' });
  });
});

describe('discard', () => {
  it('emptiesTheStationWithoutRefund', () => {
    const start = withStations(labState(1), { 'alambique-1': curaBrew(5) });
    const state = stateOf(discard(start, catalog, 'alambique-1'));
    expect(state.lab.stations).toEqual({});
    expect(stockOf(state, 'hortela')).toBe(0);
    expect(state.log.at(-1)).toEqual({
      day: 1,
      kind: 'lab_discarded',
      station: 'alambique-1',
      material: 'Poção de Cura',
    });
  });

  it.each([
    { name: 'empty', stationId: 'alambique-1', error: 'station_empty' },
    { name: 'unknown station', stationId: 'caldeirao-1', error: 'unknown_station' },
  ])('refuses: $name', ({ stationId, error }) => {
    expect(discard(labState(1), catalog, stationId)).toEqual({ ok: false, error });
  });
});

describe('brewLab', () => {
  it('progressesOneDay', () => {
    const start = withStations(labState(1), { 'alambique-1': curaBrew(3) });
    expect(brewLab(start, catalog).lab.stations['alambique-1']?.progressTenths).toBe(13);
  });

  it('readyAfterDays', () => {
    const start = withStations(labState(1), { 'alambique-1': { ...curaBrew(0), days: 3 } });
    const days = [1, 2, 3].reduce((state) => brewLab(state, catalog), start);
    expect(collect(days, catalog, 'alambique-1').ok).toBe(true);
  });

  it('leavesStationsOutsideTheLevelInForce', () => {
    const start = withStations(labState(1), { 'caldeirao-1': curaBrew(3) });
    expect(brewLab(start, catalog).lab.stations['caldeirao-1']?.progressTenths).toBe(3);
  });
});

describe('settleLab', () => {
  const at = (level: number, stations: Record<string, Brew>, stock = {}) =>
    withStations(labState(level, { stock }), stations);

  it('keepsBrewsInStationsInForce', () => {
    const start = at(1, { 'alambique-1': curaBrew(3) });
    expect(settleLab(start, catalog)).toBe(start);
  });

  it('settlesOnForcedDowngrade: ready is collected', () => {
    const state = settleLab(at(1, { 'alambique-3': curaBrew(10) }), catalog);
    expect(state.lab.stations).toEqual({});
    expect(stockOf(state, 'cura')).toBe(2);
  });

  it('settlesOnForcedDowngrade: brewing moves to a free station of its type', () => {
    const state = settleLab(
      at(1, { 'alambique-1': curaBrew(1), 'alambique-3': curaBrew(4) }),
      catalog,
    );
    expect(state.lab.stations).toEqual({
      'alambique-1': curaBrew(1),
      'alambique-2': curaBrew(4),
    });
  });

  it('settlesOnForcedDowngrade: no free station refunds what was spent', () => {
    const state = settleLab(
      at(1, {
        'alambique-1': curaBrew(1),
        'alambique-2': curaBrew(1),
        'alambique-3': curaBrew(4),
      }),
      catalog,
    );
    expect(Object.keys(state.lab.stations)).toEqual(['alambique-1', 'alambique-2']);
    expect(stockOf(state, 'hortela')).toBe(3);
    expect(stockOf(state, 'camomila')).toBe(1);
    expect(state.log.at(-1)).toEqual({
      day: 1,
      kind: 'lab_ingredients_returned',
      station: 'alambique-3',
      ingredients: [
        { material: 'Hortelã', quantity: 3 },
        { material: 'Camomila', quantity: 1 },
      ],
    });
  });

  it('settlesAllStationsWhenRemoved', () => {
    const state = settleLab(
      at(0, { 'alambique-1': curaBrew(10), 'caldeirao-1': curaBrew(2) }),
      catalog,
    );
    expect(state.lab.stations).toEqual({});
    expect(stockOf(state, 'cura')).toBe(2);
    expect(stockOf(state, 'hortela')).toBe(3);
  });

  it('refundSkipsDeletedIngredient', () => {
    const start = at(0, { 'alambique-1': curaBrew(2) });
    const withoutHortela = {
      ...start,
      materials: {
        ...start.materials,
        items: start.materials.items.filter((m) => m.id !== 'hortela'),
      },
    };
    const state = settleLab(withoutHortela, catalog);
    expect(stockOf(state, 'camomila')).toBe(1);
    expect(state.log.at(-1)).toMatchObject({
      kind: 'lab_ingredients_returned',
      ingredients: [{ material: 'Camomila', quantity: 1 }],
    });
  });

  it('refundsOnlyWhatMasterSpent', () => {
    const brewed = stateOf(
      brew(
        labState(1, { stock: { hortela: 1 }, recipes: [cura] }),
        catalog,
        { stationId: 'alambique-1', recipeId: 'r-cura' },
        master,
      ),
    );
    const removed = { ...brewed, slots: {} };
    const state = settleLab(removed, catalog);
    expect(stockOf(state, 'hortela')).toBe(1);
    expect(stockOf(state, 'camomila')).toBe(0);
  });

  it('dropsAnEmptyRefundWithoutALogLine', () => {
    const start = at(0, { 'alambique-1': { ...curaBrew(2), spent: [] } });
    const state = settleLab(start, catalog);
    expect(state.lab.stations).toEqual({});
    expect(state.log).toEqual(start.log);
  });
});
