import type { Actor } from '../commands/schema';
import type { Catalog } from '../model/catalog';
import { ARCANE_LAB_BUILDING_ID } from '../model/catalog';
import type {
  Brew,
  GameState,
  Lab,
  Portion,
  Recipe,
  StationDef,
  StationType,
} from '../model/schema';
import { builtLevel } from './BuildSystem';
import { addStock, findMaterial } from './Materials';
import { fail, ok, withLog, type Outcome } from './outcome';

export { ARCANE_LAB_BUILDING_ID };

/** A brew is ready when `progressTenths` reaches `days` times this. */
export const BREW_TENTHS_PER_DAY = 10;

export type RecipeFields = Omit<Recipe, 'id'>;

export function isBrewReady(brew: Brew): boolean {
  return brew.progressTenths >= brew.days * BREW_TENTHS_PER_DAY;
}

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

export interface BrewOrder {
  stationId: string;
  recipeId: string;
}

export function brew(state: GameState, catalog: Catalog, order: BrewOrder, actor: Actor): Outcome {
  const isMaster = actor.role === 'master';
  if (labLevel(state) < 1) return fail('lab_not_built');
  const station = stationsInForce(state, catalog).find((s) => s.id === order.stationId);
  if (!station) return fail('unknown_station');
  if (state.lab.stations[station.id]) return fail('station_busy');
  const recipe = findRecipe(state, order.recipeId);
  const output = recipe && findMaterial(state.materials, recipe.outputId);
  if (!recipe || !output || !materialsExist(state, recipe)) return fail('not_found');
  if (recipe.hidden && !isMaster) return fail('not_found');
  if (recipe.stationType !== station.type) return fail('wrong_station_type');

  const spent = spendable(state, recipe.ingredients);
  const isShort = spent.some(
    (portion, i) => portion.quantity < (recipe.ingredients[i]?.quantity ?? 0),
  );
  if (isShort && !isMaster) return fail('missing_ingredients');
  const taken = spent.filter((portion) => portion.quantity > 0);
  const paid = taken.reduce((current, p) => addStock(current, p.materialId, -p.quantity), state);
  const brewing: Brew = {
    recipeId: recipe.id,
    outputId: recipe.outputId,
    outputQty: recipe.outputQty,
    days: recipe.days,
    spent: taken,
    ...(recipe.color ? { color: recipe.color } : {}),
    progressTenths: 0,
  };
  return ok(
    withLog(withStation(paid, station.id, brewing), {
      day: state.day,
      kind: 'lab_brewed',
      station: station.id,
      material: output.name,
      ingredients: namedPortions(state, taken),
    }),
  );
}

/** Each ingredient capped at the stock: the master brews with whatever there is. */
function spendable(state: GameState, ingredients: readonly Portion[]): Portion[] {
  return ingredients.map(({ materialId, quantity }) => {
    const stock = findMaterial(state.materials, materialId)?.quantity ?? 0;
    return { materialId, quantity: Math.max(0, Math.min(stock, quantity)) };
  });
}

/** Names at the time, for the log; a material that is gone is left out. */
function namedPortions(state: GameState, portions: readonly Portion[]) {
  return portions.flatMap(({ materialId, quantity }) => {
    const material = findMaterial(state.materials, materialId);
    return material ? [{ material: material.name, quantity }] : [];
  });
}

/** `stationId` undefined collects every ready station in force; `nothing_changed` when none is ready. */
export function collect(
  state: GameState,
  catalog: Catalog,
  stationId: string | undefined,
): Outcome {
  const inForce = stationsInForce(state, catalog).map((station) => station.id);
  if (stationId === undefined) {
    const ready = inForce.filter((id) => {
      const brewing = state.lab.stations[id];
      return brewing !== undefined && isBrewReady(brewing);
    });
    return ready.length === 0 ? fail('nothing_changed') : ok(bottle(state, ready));
  }
  if (!inForce.includes(stationId)) return fail('unknown_station');
  const brewing = state.lab.stations[stationId];
  if (!brewing) return fail('station_empty');
  if (!isBrewReady(brewing)) return fail('not_ready');
  return ok(bottle(state, [stationId]));
}

/** Frees the stations and delivers their potions, one log line per material. A potion that is gone yields nothing. */
function bottle(state: GameState, stationIds: readonly string[]): GameState {
  const totals = stationIds.reduce((sum, id) => {
    const brewing = state.lab.stations[id];
    return brewing
      ? sum.set(brewing.outputId, (sum.get(brewing.outputId) ?? 0) + brewing.outputQty)
      : sum;
  }, new Map<string, number>());
  const freed = stationIds.reduce(withoutStation, state);
  return [...totals].reduce(
    (current, [materialId, quantity]) => deliver(current, materialId, quantity),
    freed,
  );
}

function deliver(state: GameState, materialId: string, quantity: number): GameState {
  const material = findMaterial(state.materials, materialId);
  if (!material) return state;
  return withLog(addStock(state, materialId, quantity), {
    day: state.day,
    kind: 'lab_collected',
    material: material.name,
    quantity,
  });
}

/** Empties the station without bottling and without giving the ingredients back. */
export function discard(state: GameState, catalog: Catalog, stationId: string): Outcome {
  if (!stationsInForce(state, catalog).some((station) => station.id === stationId)) {
    return fail('unknown_station');
  }
  const brewing = state.lab.stations[stationId];
  if (!brewing) return fail('station_empty');
  const potionName = findMaterial(state.materials, brewing.outputId)?.name ?? brewing.outputId;
  return ok(
    withLog(withoutStation(state, stationId), {
      day: state.day,
      kind: 'lab_discarded',
      station: stationId,
      material: potionName,
    }),
  );
}

function withStation(state: GameState, stationId: string, brewing: Brew): GameState {
  return setStations(state, { ...state.lab.stations, [stationId]: brewing });
}

function withoutStation(state: GameState, stationId: string): GameState {
  const rest = Object.entries(state.lab.stations).filter(([id]) => id !== stationId);
  return setStations(state, Object.fromEntries(rest));
}

function setStations(state: GameState, stations: Lab['stations']): GameState {
  return { ...state, lab: { ...state.lab, stations } };
}

function setRecipes(state: GameState, recipes: Lab['recipes']): GameState {
  return { ...state, lab: { ...state.lab, recipes } };
}
