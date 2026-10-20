import type { Actor } from '../../commands/schema';
import type { Catalog } from '../../model/catalog';
import type {
  Brew,
  GameState,
  LabLayout,
  Recipe,
  StationDef,
  StationType,
  StockRef,
} from '../../model/schema';
import { t } from '../../i18n/pt-BR';
import { stationLabel } from '../../i18n/stationLabel';
import { BREW_TENTHS_PER_DAY, isBrewReady, recipesFor, stationsInForce } from '../../systems/Lab';
import { refKey, refName, refQuantity, sameRef, type DepotSnapshot } from '../../systems/Stock';

export type StationView =
  | { kind: 'free'; station: StationDef }
  | {
      kind: 'brewing';
      station: StationDef;
      brew: Brew;
      potionName: string;
      daysLeft: number;
      /** 0..1 */
      progress: number;
    }
  | { kind: 'ready'; station: StationDef; brew: Brew; potionName: string };

export function stationViews(
  state: GameState,
  catalog: Catalog,
  depot: DepotSnapshot,
): StationView[] {
  return stationsInForce(state, catalog).map((station) => stationView(state, station, depot));
}

function stationView(state: GameState, station: StationDef, depot: DepotSnapshot): StationView {
  const brew = state.lab.stations[station.id];
  if (!brew) return { kind: 'free', station };
  const potionName = refName(brew.output, state, depot) ?? t.garden.missingItem;
  if (isBrewReady(brew)) return { kind: 'ready', station, brew, potionName };
  const totalTenths = brew.days * BREW_TENTHS_PER_DAY;
  return {
    kind: 'brewing',
    station,
    brew,
    potionName,
    daysLeft: Math.ceil((totalTenths - brew.progressTenths) / BREW_TENTHS_PER_DAY),
    progress: brew.progressTenths / totalTenths,
  };
}

export function labSummary(views: readonly StationView[]): {
  ready: number;
  brewing: number;
  free: number;
} {
  const count = (kind: StationView['kind']) => views.filter((view) => view.kind === kind).length;
  return { ready: count('ready'), brewing: count('brewing'), free: count('free') };
}

/** "Alambique 2: Poção de Cura, falta 1 dia". */
export function stationAria(view: StationView): string {
  const label = stationLabel(view.station.id);
  switch (view.kind) {
    case 'free':
      return t.lab.stationAria.free(label);
    case 'brewing':
      return t.lab.stationAria.brewing(label, view.potionName, view.daysLeft);
    case 'ready':
      return t.lab.stationAria.ready(label, view.potionName, view.brew.outputQty);
  }
}

export interface LockedStation {
  station: StationDef;
  /** The level that opens it. */
  level: number;
}

/** Stations later levels add, each at the first level that has it, for the dashed outlines. */
export function lockedStations(levels: LabLayout['levels'], level: number): LockedStation[] {
  const shown = new Set((levels[level - 1]?.stations ?? []).map((station) => station.id));
  const upcoming = levels
    .slice(level)
    .flatMap(({ stations }, i) => stations.map((station) => ({ station, level: level + 1 + i })))
    .filter(({ station }) => !shown.has(station.id));
  return upcoming.filter(
    ({ station }, i) => upcoming.findIndex((other) => other.station.id === station.id) === i,
  );
}

export interface IngredientView {
  ref: StockRef;
  /** `refKey(ref)`, for lists and DOM keys. */
  key: string;
  name: string;
  have: number;
  need: number;
  missing: boolean;
  /** Some crop of the Estufa harvests it. */
  fromGarden: boolean;
}

export interface RecipeOption {
  recipe: Recipe;
  outputName: string;
  hidden: boolean;
  ingredients: IngredientView[];
  /** The master brews with whatever there is; a player needs every ingredient. */
  canBrew: boolean;
  /** Names of the ingredients short in stock. */
  missing: string[];
}

/** Every recipe of the station type the viewer may see, including ones the stock cannot pay for. */
export function recipeOptions(
  state: GameState,
  stationType: StationType,
  { actor, depot }: { actor: Actor; depot: DepotSnapshot },
): RecipeOption[] {
  const isMaster = actor.role === 'master';
  return recipesFor(state, stationType, isMaster, depot).map((recipe) => {
    const ingredients = recipe.ingredients.map(({ ref, quantity }) =>
      ingredientView(state, depot, ref, quantity),
    );
    const missing = ingredients.filter((i) => i.missing).map((i) => i.name);
    return {
      recipe,
      outputName: refName(recipe.output, state, depot) ?? t.garden.missingItem,
      hidden: recipe.hidden,
      ingredients,
      canBrew: isMaster || missing.length === 0,
      missing,
    };
  });
}

function ingredientView(
  state: GameState,
  depot: DepotSnapshot,
  ref: StockRef,
  need: number,
): IngredientView {
  const have = refQuantity(ref, state, depot);
  return {
    ref,
    key: refKey(ref),
    name: refName(ref, state, depot) ?? t.garden.missingItem,
    have,
    need,
    missing: have < need,
    fromGarden: state.garden.crops.some((crop) => sameRef(crop.harvest, ref)),
  };
}

export type LabTab = 'lab' | 'recipes';

/** Only the master manages recipes; players get no tab bar at all. */
export function visibleTabs(isMaster: boolean): readonly LabTab[] {
  return isMaster ? ['lab', 'recipes'] : [];
}
