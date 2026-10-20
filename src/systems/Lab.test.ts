import { describe, expect, it } from 'vitest';
import { ARCANE_LAB_BUILDING_ID } from '../model/catalog';
import type { Actor } from '../commands/schema';
import type { Brew, GameState, PlacedBuilding, Recipe, StockRef } from '../model/schema';
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
import type { StockedOutcome } from './outcome';
import type { DepotSnapshot } from './Stock';
import { arcaneLabCatalog as catalog, makeState } from './testFixtures';

const material = (materialId: string): StockRef => ({ source: 'material', materialId });
const item = (itemId: string): StockRef => ({ source: 'depot', itemId });
const NO_DEPOT: DepotSnapshot = [];

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
  output: material('cura'),
  outputQty: 2,
  ingredients: [
    { ref: material('hortela'), quantity: 3 },
    { ref: material('camomila'), quantity: 1 },
  ],
  stationType: 'alambique',
  days: 1,
  hidden: false,
};

const mana: Recipe = {
  id: 'r-mana',
  output: material('mana'),
  outputQty: 3,
  ingredients: [{ ref: material('aetherium'), quantity: 1 }],
  stationType: 'caldeirao',
  days: 3,
  hidden: true,
};

const fieldsOf = (recipe: Recipe): RecipeFields => ({
  output: recipe.output,
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
    const outcome = addRecipe(labState(1), cura, NO_DEPOT);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(findRecipe(outcome.state, 'r-cura')).toEqual(cura);
  });

  it.each([
    { name: 'unknown output', recipe: { ...cura, output: material('nope') }, error: 'not_found' },
    {
      name: 'unknown ingredient',
      recipe: { ...cura, ingredients: [{ ref: material('nope'), quantity: 1 }] },
      error: 'not_found',
    },
  ])('refuses $name', ({ recipe, error }) => {
    expect(addRecipe(labState(1), recipe, NO_DEPOT)).toEqual({ ok: false, error });
  });

  it('refusesASecondRecipeWithTheSameId', () => {
    expect(addRecipe(labState(1, { recipes: [cura] }), cura, NO_DEPOT)).toEqual({
      ok: false,
      error: 'recipe_already_exists',
    });
  });

  it('updatesARecipe', () => {
    const outcome = updateRecipe(
      labState(1, { recipes: [cura] }),
      'r-cura',
      {
        ...fieldsOf(cura),
        days: 4,
        hidden: true,
      },
      NO_DEPOT,
    );
    if (!outcome.ok) throw new Error(outcome.error);
    expect(findRecipe(outcome.state, 'r-cura')).toEqual({ ...cura, days: 4, hidden: true });
  });

  it.each([
    { name: 'unknown recipe', recipeId: 'nope', fields: fieldsOf(cura) },
    {
      name: 'unknown output',
      recipeId: 'r-cura',
      fields: { ...fieldsOf(cura), output: material('x') },
    },
    {
      name: 'unknown ingredient',
      recipeId: 'r-cura',
      fields: { ...fieldsOf(cura), ingredients: [{ ref: material('x'), quantity: 1 }] },
    },
  ])('refusesUpdateWith $name', ({ recipeId, fields }) => {
    expect(updateRecipe(labState(1, { recipes: [cura] }), recipeId, fields, NO_DEPOT)).toEqual({
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
  const tonico: Recipe = { ...cura, id: 'r-tonico', output: material('mana'), hidden: false };
  const recipes = [cura, tonico, mana];
  const ids = (list: readonly Recipe[]) => list.map((r) => r.id);

  it('listsTheStationTypeSortedByOutputName', () => {
    expect(ids(recipesFor(labState(1, { recipes }), 'alambique', false, NO_DEPOT))).toEqual([
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
    expect(recipesFor(withoutCamomila, 'alambique', true, NO_DEPOT)).toEqual([]);
  });

  it('hidesHiddenRecipesFromPlayers', () => {
    expect(recipesFor(labState(2, { recipes }), 'caldeirao', false, NO_DEPOT)).toEqual([]);
  });

  it('masterSeesHiddenRecipes', () => {
    expect(ids(recipesFor(labState(2, { recipes }), 'caldeirao', true, NO_DEPOT))).toEqual([
      'r-mana',
    ]);
  });
});

const player: Actor = { role: 'player', characterId: 'thorin' };
const master: Actor = { role: 'master' };
const stockOf = (state: GameState, id: string) =>
  state.materials.items.find((m) => m.id === id)?.quantity;
const stateOf = (outcome: StockedOutcome): GameState => {
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.state;
};

/** The copy a station keeps of `cura` once brewed with the full recipe. */
const curaBrew = (progressTenths: number): Brew => ({
  recipeId: 'r-cura',
  output: material('cura'),
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
  const brewed = (state: GameState) => stateOf(brew(state, catalog, order, player, NO_DEPOT));

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
    expect(brew(start, catalog, order, player, NO_DEPOT)).toEqual({
      ok: false,
      error: 'missing_ingredients',
    });
  });

  it('masterBrewsWithoutStock', () => {
    const start = labState(1, { stock: { hortela: 2 }, recipes: [cura] });
    const state = stateOf(brew(start, catalog, order, master, NO_DEPOT));
    expect(state.lab.stations['alambique-1']?.spent).toEqual([
      { ref: material('hortela'), quantity: 2 },
    ]);
    expect(stockOf(state, 'hortela')).toBe(0);
  });

  it('playerCannotBrewHiddenRecipe', () => {
    const start = labState(1, { stock: stocked, recipes: [{ ...cura, hidden: true }] });
    expect(brew(start, catalog, order, player, NO_DEPOT)).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('masterBrewsHiddenRecipe', () => {
    const start = labState(1, { stock: stocked, recipes: [{ ...cura, hidden: true }] });
    expect(brew(start, catalog, order, master, NO_DEPOT).ok).toBe(true);
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
    expect(brew(start, catalog, order, master, NO_DEPOT)).toEqual({ ok: false, error });
  });

  it('refusesBusyStation', () => {
    const start = withStations(labState(1, { stock: stocked, recipes: [cura] }), {
      'alambique-1': curaBrew(0),
    });
    expect(brew(start, catalog, order, player, NO_DEPOT)).toEqual({
      ok: false,
      error: 'station_busy',
    });
  });

  it('refusesStationAboveLevelInForceDuringUpgrade', () => {
    const start = labState(2, {
      status: 'building',
      stock: stocked,
      recipes: [{ ...mana, hidden: false }],
    });
    const order = { stationId: 'caldeirao-1', recipeId: 'r-mana' };
    expect(brew(start, catalog, order, player, NO_DEPOT)).toEqual({
      ok: false,
      error: 'unknown_station',
    });
  });

  it('editingRecipeKeepsRunningBrew', () => {
    const brewing = brewed(labState(1, { stock: stocked, recipes: [cura] }));
    const fields = { ...fieldsOf(cura), outputQty: 9, days: 7 };
    const edited = stateOf(updateRecipe(brewing, 'r-cura', fields, NO_DEPOT));
    expect(edited.lab.stations['alambique-1']).toEqual(curaBrew(0));
  });

  it('hidingRecipeKeepsRunningBrew', () => {
    const brewing = brewed(labState(1, { stock: stocked, recipes: [cura] }));
    const fields = { ...fieldsOf(cura), hidden: true };
    const hidden = stateOf(updateRecipe(brewing, 'r-cura', fields, NO_DEPOT));
    expect(hidden.lab.stations['alambique-1']).toEqual(curaBrew(0));
  });

  it('removingRecipeKeepsRunningBrew', () => {
    const brewing = brewed(labState(1, { stock: stocked, recipes: [cura] }));
    const removed = stateOf(removeRecipe(brewing, 'r-cura'));
    expect(removed.lab.stations['alambique-1']).toEqual(curaBrew(0));
    const ready = withStations(removed, { 'alambique-1': curaBrew(10) });
    expect(stockOf(stateOf(collect(ready, catalog, 'alambique-1', NO_DEPOT)), 'cura')).toBe(2);
  });
});

describe('collect', () => {
  const ready = curaBrew(10);

  it('collectsAReadyStation', () => {
    const start = withStations(labState(1), { 'alambique-1': ready });
    const state = stateOf(collect(start, catalog, 'alambique-1', NO_DEPOT));
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
    expect(collect(withStations(labState(1), stations), catalog, stationId, NO_DEPOT)).toEqual({
      ok: false,
      error,
    });
  });

  it('collectsMissingOutputAsNothing', () => {
    const start = withStations(labState(1), {
      'alambique-1': { ...ready, output: material('gone') },
    });
    const state = stateOf(collect(start, catalog, 'alambique-1', NO_DEPOT));
    expect(state.lab.stations).toEqual({});
    expect(state.log).toEqual(start.log);
  });

  it('collectAllSkipsBrewingAndEmpty', () => {
    const start = withStations(labState(2), {
      'alambique-1': ready,
      'alambique-2': curaBrew(5),
      'alambique-3': ready,
    });
    const state = stateOf(collect(start, catalog, undefined, NO_DEPOT));
    expect(Object.keys(state.lab.stations)).toEqual(['alambique-2']);
    expect(stockOf(state, 'cura')).toBe(4);
    expect(state.log.filter((e) => e.kind === 'lab_collected')).toEqual([
      { day: 1, kind: 'lab_collected', material: 'Poção de Cura', quantity: 4 },
    ]);
  });

  it('collectAllWithNothingReady', () => {
    const start = withStations(labState(1), { 'alambique-1': curaBrew(5) });
    expect(collect(start, catalog, undefined, NO_DEPOT)).toEqual({
      ok: false,
      error: 'nothing_changed',
    });
  });
});

describe('discard', () => {
  it('emptiesTheStationWithoutRefund', () => {
    const start = withStations(labState(1), { 'alambique-1': curaBrew(5) });
    const state = stateOf(discard(start, catalog, 'alambique-1', NO_DEPOT));
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
    expect(discard(labState(1), catalog, stationId, NO_DEPOT)).toEqual({ ok: false, error });
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
    expect(collect(days, catalog, 'alambique-1', NO_DEPOT).ok).toBe(true);
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
    expect(settleLab(start, catalog, NO_DEPOT).state).toBe(start);
  });

  it('settlesOnForcedDowngrade: ready is collected', () => {
    const state = settleLab(at(1, { 'alambique-3': curaBrew(10) }), catalog, NO_DEPOT).state;
    expect(state.lab.stations).toEqual({});
    expect(stockOf(state, 'cura')).toBe(2);
  });

  it('settlesOnForcedDowngrade: brewing moves to a free station of its type', () => {
    const state = settleLab(
      at(1, { 'alambique-1': curaBrew(1), 'alambique-3': curaBrew(4) }),
      catalog,
      NO_DEPOT,
    ).state;
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
      NO_DEPOT,
    ).state;
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
      NO_DEPOT,
    ).state;
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
    const state = settleLab(withoutHortela, catalog, NO_DEPOT).state;
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
        NO_DEPOT,
      ),
    );
    const removed = { ...brewed, slots: {} };
    const state = settleLab(removed, catalog, NO_DEPOT).state;
    expect(stockOf(state, 'hortela')).toBe(1);
    expect(stockOf(state, 'camomila')).toBe(0);
  });

  it('dropsAnEmptyRefundWithoutALogLine', () => {
    const start = at(0, { 'alambique-1': { ...curaBrew(2), spent: [] } });
    const state = settleLab(start, catalog, NO_DEPOT).state;
    expect(state.lab.stations).toEqual({});
    expect(state.log).toEqual(start.log);
  });
});

describe('lab with depot items', () => {
  const NOW = '2026-10-19T12:00:00.000Z';
  const view = (id: string, name: string, quantity: number, live = true) => ({
    id,
    name,
    quantity,
    live,
    updatedAt: NOW,
  });
  /** Poção de cavalo (depot) from 3 Hortelã (depot) and 1 Camomila (material). */
  const cavalo: Recipe = {
    id: 'r-cavalo',
    output: item('pocao_cavalo'),
    outputQty: 2,
    ingredients: [
      { ref: item('erva'), quantity: 3 },
      { ref: material('camomila'), quantity: 1 },
    ],
    stationType: 'alambique',
    days: 1,
    hidden: false,
  };
  const depot = (herbs: number, potionLive = true): DepotSnapshot => [
    view('erva', 'Hortelã do jardim', herbs),
    view('pocao_cavalo', 'Porção de cavalo', 0, potionLive),
  ];
  const order = { stationId: 'alambique-1', recipeId: 'r-cavalo' };
  const start = (camomila = 1) => labState(1, { stock: { camomila }, recipes: [cavalo] });
  const brewing = (progressTenths: number, spent = cavalo.ingredients): Brew => ({
    recipeId: 'r-cavalo',
    output: cavalo.output,
    outputQty: 2,
    days: 1,
    spent,
    progressTenths,
  });
  const stockedOf = (outcome: StockedOutcome) => {
    if (!outcome.ok) throw new Error(outcome.error);
    return outcome;
  };

  it('addsARecipeLinkedToExistingItems', () => {
    const outcome = stockedOf(addRecipe(labState(1), cavalo, depot(0)));
    expect(findRecipe(outcome.state, 'r-cavalo')).toEqual(cavalo);
  });

  it.each([
    { name: 'an unknown output item', snapshot: [view('erva', 'Hortelã', 0)] },
    { name: 'a trashed ingredient item', snapshot: [view('erva', 'Hortelã', 0, false)] },
  ])('refusesRecipeWith $name', ({ snapshot }) => {
    expect(addRecipe(labState(1), cavalo, snapshot)).toEqual({ ok: false, error: 'not_found' });
  });

  it('hidesRecipesWhoseItemIsGone', () => {
    const state = start();
    expect(recipesFor(state, 'alambique', false, depot(0)).map((r) => r.id)).toEqual(['r-cavalo']);
    expect(recipesFor(state, 'alambique', true, depot(0, false))).toEqual([]);
  });

  it('playerBrewsAMixedRecipe', () => {
    const outcome = stockedOf(brew(start(), catalog, order, player, depot(3)));
    expect(outcome.stock).toEqual([{ itemId: 'erva', delta: -3, mode: 'strict' }]);
    expect(stockOf(outcome.state, 'camomila')).toBe(0);
    expect(outcome.state.lab.stations['alambique-1']).toEqual(brewing(0));
    expect(outcome.state.log.at(-1)).toEqual({
      day: 1,
      kind: 'lab_brewed',
      station: 'alambique-1',
      material: 'Porção de cavalo',
      ingredients: [
        { material: 'Hortelã do jardim', quantity: 3 },
        { material: 'Camomila', quantity: 1 },
      ],
    });
  });

  it('refusesAPlayerShortOfADepotIngredient', () => {
    expect(brew(start(), catalog, order, player, depot(2))).toEqual({
      ok: false,
      error: 'missing_ingredients',
    });
  });

  it('masterClampsDepotSpend', () => {
    const outcome = stockedOf(brew(start(0), catalog, order, master, depot(1)));
    expect(outcome.stock).toEqual([{ itemId: 'erva', delta: -1, mode: 'clamp' }]);
    expect(outcome.state.lab.stations['alambique-1']?.spent).toEqual([
      { ref: item('erva'), quantity: 1 },
    ]);
  });

  it('collectsIntoTheDepotItem', () => {
    const ready = withStations(start(), { 'alambique-1': brewing(10) });
    const outcome = stockedOf(collect(ready, catalog, 'alambique-1', depot(0)));
    expect(outcome.stock).toEqual([{ itemId: 'pocao_cavalo', delta: 2, mode: 'strict' }]);
    expect(outcome.state.log.at(-1)).toEqual({
      day: 1,
      kind: 'lab_collected',
      material: 'Porção de cavalo',
      quantity: 2,
    });
  });

  it('logsACollectForATrashedItemAsLost', () => {
    const ready = withStations(start(), { 'alambique-1': brewing(10) });
    const outcome = stockedOf(collect(ready, catalog, 'alambique-1', depot(0, false)));
    expect(outcome.stock).toEqual([]);
    expect(outcome.state.lab.stations).toEqual({});
    expect(outcome.state.log.at(-1)).toEqual({
      day: 1,
      kind: 'lab_collected',
      material: 'Porção de cavalo',
      quantity: 2,
      lost: true,
    });
  });

  it('settleRefundsDepotIngredients', () => {
    const removed = withStations(labState(0, { stock: { camomila: 0 } }), {
      'alambique-1': brewing(2),
    });
    const settled = settleLab(removed, catalog, depot(0));
    expect(settled.stock).toEqual([{ itemId: 'erva', delta: 3, mode: 'strict' }]);
    expect(stockOf(settled.state, 'camomila')).toBe(1);
    expect(settled.state.log.at(-1)).toMatchObject({
      kind: 'lab_ingredients_returned',
      ingredients: [
        { material: 'Hortelã do jardim', quantity: 3 },
        { material: 'Camomila', quantity: 1 },
      ],
    });
  });

  it('logsARefundToATrashedItemAsLost', () => {
    const removed = withStations(labState(0), { 'alambique-1': brewing(2) });
    const trashed = [view('erva', 'Hortelã do jardim', 0, false)];
    const settled = settleLab(removed, catalog, trashed);
    expect(settled.stock).toEqual([]);
    expect(settled.state.log.at(-1)).toMatchObject({
      ingredients: [
        { material: 'Hortelã do jardim', quantity: 3, lost: true },
        { material: 'Camomila', quantity: 1 },
      ],
    });
  });

  it('discardsNamingTheDepotPotion', () => {
    const busy = withStations(start(), { 'alambique-1': brewing(5) });
    const outcome = stockedOf(discard(busy, catalog, 'alambique-1', depot(0)));
    expect(outcome.state.log.at(-1)).toMatchObject({ material: 'Porção de cavalo' });
  });
});
