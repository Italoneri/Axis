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
  StockRef,
} from '../model/schema';
import { builtLevel } from './BuildSystem';
import { addStock } from './Materials';
import { fail, stocked, withLog, type Stocked, type StockedOutcome } from './outcome';
import {
  gainStock,
  refExists,
  refKey,
  refName,
  refQuantity,
  spendMode,
  type DepotSnapshot,
  type StockMove,
} from './Stock';

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

/** Everything the recipe names (output and ingredients) still exists. */
function refsExist(state: GameState, recipe: RecipeFields, depot: DepotSnapshot): boolean {
  return [recipe.output, ...recipe.ingredients.map((i) => i.ref)].every((ref) =>
    refExists(ref, state, depot),
  );
}

/** Recipes for a station type whose refs all still exist, by output name; hidden ones only for the master. */
export function recipesFor(
  state: GameState,
  stationType: StationType,
  isMaster: boolean,
  depot: DepotSnapshot,
): Recipe[] {
  const outputName = (recipe: Recipe) => refName(recipe.output, state, depot) ?? '';
  return state.lab.recipes
    .filter(
      (recipe) =>
        recipe.stationType === stationType &&
        (isMaster || !recipe.hidden) &&
        refsExist(state, recipe, depot),
    )
    .sort((a, b) => outputName(a).localeCompare(outputName(b)));
}

export function addRecipe(state: GameState, recipe: Recipe, depot: DepotSnapshot): StockedOutcome {
  if (!refsExist(state, recipe, depot)) return fail('not_found');
  if (findRecipe(state, recipe.id)) return fail('recipe_already_exists');
  return stocked(setRecipes(state, [...state.lab.recipes, recipe]));
}

/** Brews keep their own copy, so editing a recipe never changes what is already brewing. */
export function updateRecipe(
  state: GameState,
  recipeId: string,
  fields: RecipeFields,
  depot: DepotSnapshot,
): StockedOutcome {
  if (!findRecipe(state, recipeId)) return fail('not_found');
  if (!refsExist(state, fields, depot)) return fail('not_found');
  const next: Recipe = { ...fields, id: recipeId };
  return stocked(
    setRecipes(
      state,
      state.lab.recipes.map((recipe) => (recipe.id === recipeId ? next : recipe)),
    ),
  );
}

/** Allowed with brews in progress: they finish from their copy. */
export function removeRecipe(state: GameState, recipeId: string): StockedOutcome {
  if (!findRecipe(state, recipeId)) return fail('not_found');
  return stocked(
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

export function brew(
  state: GameState,
  catalog: Catalog,
  order: BrewOrder,
  actor: Actor,
  depot: DepotSnapshot,
): StockedOutcome {
  const isMaster = actor.role === 'master';
  if (labLevel(state) < 1) return fail('lab_not_built');
  const station = stationsInForce(state, catalog).find((s) => s.id === order.stationId);
  if (!station) return fail('unknown_station');
  if (state.lab.stations[station.id]) return fail('station_busy');
  const recipe = findRecipe(state, order.recipeId);
  const outputName = recipe && refName(recipe.output, state, depot);
  if (!recipe || outputName === undefined || !refsExist(state, recipe, depot)) {
    return fail('not_found');
  }
  if (recipe.hidden && !isMaster) return fail('not_found');
  if (recipe.stationType !== station.type) return fail('wrong_station_type');

  const spent = spendable(state, recipe.ingredients, depot);
  const isShort = spent.some(
    (portion, i) => portion.quantity < (recipe.ingredients[i]?.quantity ?? 0),
  );
  if (isShort && !isMaster) return fail('missing_ingredients');
  const taken = spent.filter((portion) => portion.quantity > 0);
  const paid = taken.reduce(
    (current, { ref, quantity }) =>
      ref.source === 'material' ? addStock(current, ref.materialId, -quantity) : current,
    state,
  );
  // Depot items leave at commit time; the master's moves take what is there by then.
  const stock = taken.flatMap(({ ref, quantity }): StockMove[] =>
    ref.source === 'depot'
      ? [{ itemId: ref.itemId, delta: -quantity, mode: spendMode(actor) }]
      : [],
  );
  const brewing: Brew = {
    recipeId: recipe.id,
    output: recipe.output,
    outputQty: recipe.outputQty,
    days: recipe.days,
    spent: taken,
    ...(recipe.color ? { color: recipe.color } : {}),
    progressTenths: 0,
  };
  const entry = {
    day: state.day,
    kind: 'lab_brewed',
    station: station.id,
    material: outputName,
    ingredients: namedPortions(state, taken, depot),
  } as const;
  return stocked(withLog(withStation(paid, station.id, brewing), entry), stock);
}

/** Each ingredient capped at the stock: the master brews with whatever there is. */
function spendable(
  state: GameState,
  ingredients: readonly Portion[],
  depot: DepotSnapshot,
): Portion[] {
  return ingredients.map(({ ref, quantity }) => {
    const stock = refQuantity(ref, state, depot);
    return { ref, quantity: Math.max(0, Math.min(stock, quantity)) };
  });
}

/** Names at the time, for the log; whatever is gone is left out. */
function namedPortions(state: GameState, portions: readonly Portion[], depot: DepotSnapshot) {
  return portions.flatMap(({ ref, quantity }) => {
    const name = refName(ref, state, depot);
    return name === undefined ? [] : [{ material: name, quantity }];
  });
}

/** `stationId` undefined collects every ready station in force; `nothing_changed` when none is ready. */
export function collect(
  state: GameState,
  catalog: Catalog,
  stationId: string | undefined,
  depot: DepotSnapshot,
): StockedOutcome {
  const inForce = stationsInForce(state, catalog).map((station) => station.id);
  if (stationId === undefined) {
    const ready = inForce.filter((id) => {
      const brewing = state.lab.stations[id];
      return brewing !== undefined && isBrewReady(brewing);
    });
    if (ready.length === 0) return fail('nothing_changed');
    const bottled = bottle(state, ready, depot);
    return stocked(bottled.state, bottled.stock);
  }
  if (!inForce.includes(stationId)) return fail('unknown_station');
  const brewing = state.lab.stations[stationId];
  if (!brewing) return fail('station_empty');
  if (!isBrewReady(brewing)) return fail('not_ready');
  const bottled = bottle(state, [stationId], depot);
  return stocked(bottled.state, bottled.stock);
}

/**
 * Frees the stations and delivers their potions, one log line per output.
 * A material that is gone yields nothing; a depot item that is gone is logged as lost.
 */
function bottle(state: GameState, stationIds: readonly string[], depot: DepotSnapshot): Stocked {
  const totals = new Map<string, { ref: StockRef; quantity: number }>();
  for (const id of stationIds) {
    const brewing = state.lab.stations[id];
    if (!brewing) continue;
    const key = refKey(brewing.output);
    const quantity = (totals.get(key)?.quantity ?? 0) + brewing.outputQty;
    totals.set(key, { ref: brewing.output, quantity });
  }
  const start: Stocked = { state: stationIds.reduce(withoutStation, state), stock: [] };
  return [...totals.values()].reduce((current, { ref, quantity }) => {
    const gained = gainStock(ref, quantity, current.state, depot);
    if (!gained) return current;
    const entry = {
      day: state.day,
      kind: 'lab_collected',
      material: gained.name,
      quantity,
    } as const;
    return {
      state: withLog(gained.state, { ...entry, ...gained.lost }),
      stock: [...current.stock, ...gained.stock],
    };
  }, start);
}

/** Empties the station without bottling and without giving the ingredients back. */
export function discard(
  state: GameState,
  catalog: Catalog,
  stationId: string,
  depot: DepotSnapshot,
): StockedOutcome {
  if (!stationsInForce(state, catalog).some((station) => station.id === stationId)) {
    return fail('unknown_station');
  }
  const brewing = state.lab.stations[stationId];
  if (!brewing) return fail('station_empty');
  const potionName = refName(brewing.output, state, depot) ?? refKey(brewing.output).slice(2);
  return stocked(
    withLog(withoutStation(state, stationId), {
      day: state.day,
      kind: 'lab_discarded',
      station: stationId,
      material: potionName,
    }),
  );
}

/** One day: every brew in a station in force gains `BREW_TENTHS_PER_DAY` (ready ones keep going harmlessly). */
export function brewLab(state: GameState, catalog: Catalog): GameState {
  const advanced = stationsInForce(state, catalog).flatMap((station) => {
    const brewing = state.lab.stations[station.id];
    return brewing
      ? [[station.id, { ...brewing, progressTenths: brewing.progressTenths + BREW_TENTHS_PER_DAY }]]
      : [];
  });
  return advanced.length === 0
    ? state
    : setStations(state, { ...state.lab.stations, ...Object.fromEntries(advanced) });
}

/** A supervising NPC: `units` days more (or less) on every brew, never below 0. Same state when nothing moved. */
export function hastenBrews(state: GameState, units: number): GameState {
  const shift = units * BREW_TENTHS_PER_DAY;
  const entries = Object.entries(state.lab.stations);
  const shifted = entries.map(([id, brewing]): [string, Brew] => [
    id,
    { ...brewing, progressTenths: Math.max(0, brewing.progressTenths + shift) },
  ]);
  const moved = shifted.some(
    ([id, brewing]) => brewing.progressTenths !== state.lab.stations[id]?.progressTenths,
  );
  return moved ? setStations(state, Object.fromEntries(shifted)) : state;
}

/**
 * Brews in stations outside `stationsInForce` (a forced lower level or a removal; upgrades keep every station):
 * ready → collected; else moved to the first free station in force of the same type, keeping progress;
 * else what was spent goes back to the stock.
 */
export function settleLab(state: GameState, catalog: Catalog, depot: DepotSnapshot): Stocked {
  const inForce = new Set(stationsInForce(state, catalog).map((station) => station.id));
  const vanished = Object.keys(state.lab.stations).filter((id) => !inForce.has(id));
  const start: Stocked = { state, stock: [] };
  return vanished.reduce((current, id) => {
    const settled = settleStation(current.state, catalog, id, depot);
    return { state: settled.state, stock: [...current.stock, ...settled.stock] };
  }, start);
}

function settleStation(
  state: GameState,
  catalog: Catalog,
  stationId: string,
  depot: DepotSnapshot,
): Stocked {
  const brewing = state.lab.stations[stationId];
  if (!brewing) return { state, stock: [] };
  if (isBrewReady(brewing)) return bottle(state, [stationId], depot);
  const cleared = withoutStation(state, stationId);
  const type = stationTypeOf(catalog, stationId);
  const free = stationsInForce(cleared, catalog).find(
    (station) => station.type === type && !cleared.lab.stations[station.id],
  );
  if (free) return { state: withStation(cleared, free.id, brewing), stock: [] };
  return refund(cleared, stationId, brewing.spent, depot);
}

/** The type a station id has in lab.json (the catalog keeps it the same across levels). */
function stationTypeOf(catalog: Catalog, stationId: string): StationType | undefined {
  return catalog.lab.levels
    .flatMap((level) => level.stations)
    .find((station) => station.id === stationId)?.type;
}

type ReturnedPortion = { material: string; quantity: number; lost?: true };

/** Gives back what the brew took; materials the master deleted return nothing, gone depot items are lost. */
function refund(
  state: GameState,
  stationId: string,
  spent: readonly Portion[],
  depot: DepotSnapshot,
): Stocked {
  const start: Stocked & { ingredients: ReturnedPortion[] } = { state, stock: [], ingredients: [] };
  const returned = spent.reduce((current, { ref, quantity }) => {
    const gained = gainStock(ref, quantity, current.state, depot);
    if (!gained) return current;
    return {
      state: gained.state,
      stock: [...current.stock, ...gained.stock],
      ingredients: [...current.ingredients, { material: gained.name, quantity, ...gained.lost }],
    };
  }, start);
  if (returned.ingredients.length === 0) return { state, stock: [] };
  const entry = {
    day: state.day,
    kind: 'lab_ingredients_returned',
    station: stationId,
    ingredients: returned.ingredients,
  } as const;
  return { state: withLog(returned.state, entry), stock: returned.stock };
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
