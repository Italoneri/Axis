import type { Catalog } from '../model/catalog';
import { ARCANE_LAB_BUILDING_ID } from '../model/catalog';
import type { GameState, Lab, Recipe, StationDef, StationType } from '../model/schema';
import { builtLevel } from './BuildSystem';
import { findMaterial } from './Materials';
import { fail, ok, type Outcome } from './outcome';

export { ARCANE_LAB_BUILDING_ID };

export type RecipeFields = Omit<Recipe, 'id'>;

export function labLevel(state: GameState): number {
  return builtLevel(state, ARCANE_LAB_BUILDING_ID);
}

/** Stations of the level in force: an upgrade in progress keeps the previous layout. */
export function stationsInForce(state: GameState, catalog: Catalog): readonly StationDef[] {
  const level = labLevel(state);
  return level < 1 ? [] : (catalog.lab.levels[level - 1]?.stations ?? []);
}

export function findRecipe(state: GameState, recipeId: string): Recipe | undefined {
  return state.lab.recipes.find((recipe) => recipe.id === recipeId);
}

/** Every material the recipe names (output and ingredients) still exists. */
function materialsExist(state: GameState, recipe: RecipeFields): boolean {
  return [recipe.outputId, ...recipe.ingredients.map((i) => i.materialId)].every(
    (id) => findMaterial(state.materials, id) !== undefined,
  );
}

/** Recipes for a station type whose materials all still exist, by output name; hidden ones only for the master. */
export function recipesFor(
  state: GameState,
  stationType: StationType,
  isMaster: boolean,
): Recipe[] {
  const outputName = (recipe: Recipe) => findMaterial(state.materials, recipe.outputId)?.name ?? '';
  return state.lab.recipes
    .filter(
      (recipe) =>
        recipe.stationType === stationType &&
        (isMaster || !recipe.hidden) &&
        materialsExist(state, recipe),
    )
    .sort((a, b) => outputName(a).localeCompare(outputName(b)));
}

export function addRecipe(state: GameState, recipe: Recipe): Outcome {
  if (!materialsExist(state, recipe)) return fail('not_found');
  if (findRecipe(state, recipe.id)) return fail('recipe_already_exists');
  return ok(setRecipes(state, [...state.lab.recipes, recipe]));
}

/** Brews keep their own copy, so editing a recipe never changes what is already brewing. */
export function updateRecipe(state: GameState, recipeId: string, fields: RecipeFields): Outcome {
  if (!findRecipe(state, recipeId)) return fail('not_found');
  if (!materialsExist(state, fields)) return fail('not_found');
  const next: Recipe = { ...fields, id: recipeId };
  return ok(
    setRecipes(
      state,
      state.lab.recipes.map((recipe) => (recipe.id === recipeId ? next : recipe)),
    ),
  );
}

/** Allowed with brews in progress: they finish from their copy. */
export function removeRecipe(state: GameState, recipeId: string): Outcome {
  if (!findRecipe(state, recipeId)) return fail('not_found');
  return ok(
    setRecipes(
      state,
      state.lab.recipes.filter((recipe) => recipe.id !== recipeId),
    ),
  );
}

function setRecipes(state: GameState, recipes: Lab['recipes']): GameState {
  return { ...state, lab: { ...state.lab, recipes } };
}
