import type { Brew, Crop, GameState, Recipe, StockRef } from '../model/schema';
import { depotIdsOf } from '../systems/Stock';
import { gameCommandSchema, type CommandType, type GameCommand } from './schema';

// Which group depot items a command may read or move, so the caller hands
// applyCommand only those (offline from the local depot, online from the
// database) instead of the whole depot.

type CommandOf = { [C in GameCommand as C['type']]: C };
type Needs = { [K in CommandType]?: (command: CommandOf[K], state: GameState) => StockRef[] };

const cropRefs = (crop: Pick<Crop, 'seed' | 'harvest'> | undefined): StockRef[] =>
  crop ? [crop.seed, crop.harvest] : [];
const recipeRefs = (recipe: Pick<Recipe, 'output' | 'ingredients'> | undefined): StockRef[] =>
  recipe ? [recipe.output, ...recipe.ingredients.map((i) => i.ref)] : [];
const brewRefs = (brew: Brew): StockRef[] => [brew.output, ...brew.spent.map((p) => p.ref)];

const cropOf = (state: GameState, cropId: string | undefined) =>
  state.garden.crops.find((crop) => crop.id === cropId);
const plantedCrops = (state: GameState, plotId?: string): Crop[] =>
  Object.entries(state.garden.plots).flatMap(([id, planting]) => {
    const crop = plotId === undefined || id === plotId ? cropOf(state, planting.cropId) : undefined;
    return crop ? [crop] : [];
  });
const brews = (state: GameState, stationId?: string): Brew[] =>
  Object.entries(state.lab.stations).flatMap(([id, brew]) =>
    stationId === undefined || id === stationId ? [brew] : [],
  );
/** Plots and stations that may settle: harvests, refunds and collections. */
const settling = (state: GameState): StockRef[] => [
  ...plantedCrops(state).flatMap(cropRefs),
  ...brews(state).flatMap(brewRefs),
];

const needs: Needs = {
  garden_crop_create: ({ crop }) => cropRefs(crop),
  garden_crop_update: ({ crop }) => cropRefs(crop),
  garden_plant: ({ cropId }, state) => cropRefs(cropOf(state, cropId)),
  garden_harvest: ({ plotId }, state) => plantedCrops(state, plotId).map((crop) => crop.harvest),
  garden_clear: ({ plotId }, state) => plantedCrops(state, plotId).map((crop) => crop.seed),
  lab_recipe_create: ({ recipe }) => recipeRefs(recipe),
  lab_recipe_update: ({ recipe }) => recipeRefs(recipe),
  lab_brew: ({ recipeId }, state) =>
    recipeRefs(state.lab.recipes.find((recipe) => recipe.id === recipeId)),
  lab_collect: ({ stationId }, state) => brews(state, stationId).map((brew) => brew.output),
  lab_discard: ({ stationId }, state) => brews(state, stationId).map((brew) => brew.output),
  advance_days: (_command, state) => settling(state),
  force_building: (_command, state) => settling(state),
  remove_building: (_command, state) => settling(state),
};

function refsFor<K extends CommandType>(type: K, command: CommandOf[K], state: GameState) {
  const need: Needs[K] = needs[type];
  return need ? need(command, state) : [];
}

/** Ids of the depot items `input` references, without repeats; none for an invalid command. */
export function depotItemsNeeded(state: GameState, input: unknown): string[] {
  const parsed = gameCommandSchema.safeParse(input);
  if (!parsed.success) return [];
  return depotIdsOf(refsFor(parsed.data.type, parsed.data, state));
}
