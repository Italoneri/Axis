import { describe, expect, it } from 'vitest';
import { ARCANE_LAB_BUILDING_ID } from '../model/catalog';
import type { GameState, PlacedBuilding, Recipe } from '../model/schema';
import {
  addRecipe,
  findRecipe,
  recipesFor,
  removeRecipe,
  stationsInForce,
  updateRecipe,
  type RecipeFields,
} from './Lab';
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
