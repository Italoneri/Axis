import type { Actor } from '../commands/schema';
import type { Catalog } from '../model/catalog';
import { HERB_GARDEN_BUILDING_ID } from '../model/catalog';
import type {
  Crop,
  GameState,
  Garden,
  PlotDef,
  PlotType,
  Planting,
  StockRef,
} from '../model/schema';
import { builtLevel } from './BuildSystem';
import { toBronze } from './Coins';
import { addStock } from './Materials';
import {
  fail,
  stocked,
  withLog,
  type ActionError,
  type Stocked,
  type StockedOutcome,
} from './outcome';
import {
  gainStock,
  refExists,
  refKey,
  refName,
  refQuantity,
  sameRef,
  spendMode,
  type DepotSnapshot,
  type StockMove,
} from './Stock';
import { CAMP, chargeWallet } from './Wallets';

export { HERB_GARDEN_BUILDING_ID };

/** A planting is ready when `growthTenths` reaches `days` times this. */
export const GROWTH_TENTHS_PER_DAY = 10;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type CropFields = DistributiveOmit<Crop, 'id'>;

export function gardenLevel(state: GameState): number {
  return builtLevel(state, HERB_GARDEN_BUILDING_ID);
}

/** Plots of the level in force: an upgrade in progress keeps the previous layout. */
export function plotsInForce(state: GameState, catalog: Catalog): readonly PlotDef[] {
  const level = gardenLevel(state);
  return level < 1 ? [] : (catalog.garden.levels[level - 1]?.plots ?? []);
}

export function findCrop(state: GameState, cropId: string): Crop | undefined {
  return state.garden.crops.find((crop) => crop.id === cropId);
}

export function isReady(crop: Crop, planting: Planting): boolean {
  return planting.growthTenths >= crop.days * GROWTH_TENTHS_PER_DAY;
}

function refsExist(state: GameState, crop: Crop | CropFields, depot: DepotSnapshot): boolean {
  return refExists(crop.seed, state, depot) && refExists(crop.harvest, state, depot);
}

/** Crops for a plot type whose seed and harvest both still exist, by seed name. */
export function cropsFor(state: GameState, plotType: PlotType, depot: DepotSnapshot): Crop[] {
  const seedName = (crop: Crop) => refName(crop.seed, state, depot) ?? '';
  return state.garden.crops
    .filter((crop) => crop.plotType === plotType && refsExist(state, crop, depot))
    .sort((a, b) => seedName(a).localeCompare(seedName(b)));
}

function isFreeCommonCrop(crop: Crop | CropFields, catalog: Catalog): boolean {
  return !crop.rare && toBronze(crop.price, catalog.currencies) === 0;
}

/** One crop per seed: another crop (not `ownId`) already planted from `seed`. */
function isSeedTaken(state: GameState, seed: StockRef, ownId?: string): boolean {
  return state.garden.crops.some((crop) => crop.id !== ownId && sameRef(crop.seed, seed));
}

export function addCrop(
  state: GameState,
  catalog: Catalog,
  crop: Crop,
  depot: DepotSnapshot,
): StockedOutcome {
  if (!refsExist(state, crop, depot)) return fail('not_found');
  if (findCrop(state, crop.id) || isSeedTaken(state, crop.seed)) {
    return fail('crop_already_exists');
  }
  if (isFreeCommonCrop(crop, catalog)) return fail('empty_price');
  return stocked(setCrops(state, [...state.garden.crops, crop]));
}

export function updateCrop(
  state: GameState,
  catalog: Catalog,
  cropId: string,
  fields: CropFields,
  depot: DepotSnapshot,
): StockedOutcome {
  if (!findCrop(state, cropId)) return fail('not_found');
  if (!refsExist(state, fields, depot)) return fail('not_found');
  if (isSeedTaken(state, fields.seed, cropId)) return fail('crop_already_exists');
  if (isFreeCommonCrop(fields, catalog)) return fail('empty_price');
  const next: Crop = { ...fields, id: cropId };
  return stocked(
    setCrops(
      state,
      state.garden.crops.map((crop) => (crop.id === cropId ? next : crop)),
    ),
  );
}

export function removeCrop(state: GameState, cropId: string): StockedOutcome {
  if (!findCrop(state, cropId)) return fail('not_found');
  const inUse = Object.values(state.garden.plots).some((planting) => planting.cropId === cropId);
  if (inUse) return fail('crop_in_use');
  return stocked(
    setCrops(
      state,
      state.garden.crops.filter((crop) => crop.id !== cropId),
    ),
  );
}

export interface PlantOrder {
  plotId: string;
  cropId: string;
  buy: boolean;
}

export function plant(
  state: GameState,
  catalog: Catalog,
  order: PlantOrder,
  actor: Actor,
  depot: DepotSnapshot,
): StockedOutcome {
  if (gardenLevel(state) < 1) return fail('garden_not_built');
  const plot = plotsInForce(state, catalog).find((p) => p.id === order.plotId);
  if (!plot) return fail('unknown_plot');
  if (state.garden.plots[plot.id]) return fail('plot_occupied');
  const crop = findCrop(state, order.cropId);
  const seedName = crop && refName(crop.seed, state, depot);
  if (!crop || seedName === undefined || !refExists(crop.harvest, state, depot)) {
    return fail('not_found');
  }
  if (crop.plotType !== plot.type) return fail('wrong_plot_type');

  const sourced = sourceSeed(state, catalog, crop, order.buy, { actor, depot });
  if (!sourced.ok) return sourced;
  const planted = withPlot(sourced.state, plot.id, { cropId: crop.id, growthTenths: 0 });
  const entry = {
    day: state.day,
    kind: 'garden_planted',
    plot: plot.id,
    seed: seedName,
    bronze: sourced.bronze,
  } as const;
  return stocked(withLog(planted, entry), sourced.stock);
}

type SeedSourced = { ok: true; state: GameState; bronze: number; stock: StockMove[] };
type SeedSource = SeedSourced | { ok: false; error: ActionError };

/**
 * An owned seed first, then the master's free one, then (common crops only) a
 * purchase by the camp. A depot seed only leaves as a move: the commit takes
 * it, refusing a player when someone else took the last one first.
 */
function sourceSeed(
  state: GameState,
  catalog: Catalog,
  crop: Crop,
  buy: boolean,
  { actor, depot }: { actor: Actor; depot: DepotSnapshot },
): SeedSource {
  const isOwned = refQuantity(crop.seed, state, depot) >= 1;
  const free: SeedSourced = { ok: true, state, bronze: 0, stock: [] };
  if (crop.seed.source === 'depot' && (isOwned || actor.role === 'master')) {
    const move = { itemId: crop.seed.itemId, delta: -1, mode: spendMode(actor) };
    return { ...free, stock: [move] };
  }
  if (crop.seed.source === 'material' && isOwned) {
    return { ...free, state: addStock(state, crop.seed.materialId, -1) };
  }
  if (actor.role === 'master') return free;
  if (!buy) return { ok: false, error: 'no_seed' };
  if (crop.rare) return { ok: false, error: 'rare_not_for_sale' };
  const bronze = toBronze(crop.price, catalog.currencies);
  const paid = chargeWallet(state, catalog, CAMP, bronze);
  return paid.ok ? { ...free, state: paid.state, bronze } : paid;
}

interface ReadyPlot {
  plotId: string;
  crop: Crop;
}

/** `plotId` undefined harvests every ready plot in force; `nothing_changed` when none is ready. */
export function harvest(
  state: GameState,
  catalog: Catalog,
  plotId: string | undefined,
  depot: DepotSnapshot,
): StockedOutcome {
  const inForce = plotsInForce(state, catalog).map((plot) => plot.id);
  if (plotId === undefined) {
    const ready = inForce.flatMap((id) => readyPlot(state, id));
    if (ready.length === 0) return fail('nothing_changed');
    const reaped = reap(state, ready, depot);
    return stocked(reaped.state, reaped.stock);
  }
  if (!inForce.includes(plotId)) return fail('unknown_plot');
  const planting = state.garden.plots[plotId];
  if (!planting) return fail('plot_empty');
  const crop = findCrop(state, planting.cropId);
  if (!crop) return fail('not_found');
  if (!isReady(crop, planting)) return fail('not_ready');
  const reaped = reap(state, [{ plotId, crop }], depot);
  return stocked(reaped.state, reaped.stock);
}

function readyPlot(state: GameState, plotId: string): ReadyPlot[] {
  const planting = state.garden.plots[plotId];
  const crop = planting && findCrop(state, planting.cropId);
  return planting && crop && isReady(crop, planting) ? [{ plotId, crop }] : [];
}

/** Common crops start growing again; rare ones free the plot. One delivery per harvest ref. */
function reap(state: GameState, plots: readonly ReadyPlot[], depot: DepotSnapshot): Stocked {
  const reset = plots.reduce(
    (current, { plotId, crop }) =>
      crop.rare
        ? withoutPlot(current, plotId)
        : withPlot(current, plotId, { cropId: crop.id, growthTenths: 0 }),
    state,
  );
  const totals = new Map<string, { ref: StockRef; quantity: number }>();
  for (const { crop } of plots) {
    const key = refKey(crop.harvest);
    const quantity = (totals.get(key)?.quantity ?? 0) + crop.yield;
    totals.set(key, { ref: crop.harvest, quantity });
  }
  const start: Stocked = { state: reset, stock: [] };
  return [...totals.values()].reduce(
    (current, { ref, quantity }) => deliver(current, ref, quantity, depot),
    start,
  );
}

/** A material that is gone yields nothing; a depot item that is gone is logged as lost. */
function deliver(
  { state, stock }: Stocked,
  ref: StockRef,
  quantity: number,
  depot: DepotSnapshot,
): Stocked {
  const entry = { day: state.day, kind: 'garden_harvested', quantity } as const;
  const gained = gainStock(ref, quantity, state, depot);
  if (!gained) return { state, stock };
  return {
    state: withLog(gained.state, { ...entry, material: gained.name, ...gained.lost }),
    stock: [...stock, ...gained.stock],
  };
}

/** One day: every planting in a plot in force gains `GROWTH_TENTHS_PER_DAY` (ready ones keep growing harmlessly). */
export function growGarden(state: GameState, catalog: Catalog): GameState {
  const grown = plotsInForce(state, catalog).flatMap((plot) => {
    const planting = state.garden.plots[plot.id];
    return planting
      ? [[plot.id, { ...planting, growthTenths: planting.growthTenths + GROWTH_TENTHS_PER_DAY }]]
      : [];
  });
  return setPlots(state, { ...state.garden.plots, ...Object.fromEntries(grown) });
}

/**
 * Plantings in plots outside `plotsInForce` (after an upgrade, a forced level or a removal):
 * ready → harvested; else moved to the first free plot in force of the crop's type, keeping growth;
 * else the seed goes back to the stock. Plantings whose crop is gone are dropped.
 * Depot items only gain here, so a settle is never refused for stock.
 */
export function settleGarden(state: GameState, catalog: Catalog, depot: DepotSnapshot): Stocked {
  const inForce = new Set(plotsInForce(state, catalog).map((plot) => plot.id));
  const vanished = Object.keys(state.garden.plots).filter((plotId) => !inForce.has(plotId));
  const start: Stocked = { state, stock: [] };
  return vanished.reduce((current, plotId) => {
    const settled = settlePlot(current.state, catalog, plotId, depot);
    return { state: settled.state, stock: [...current.stock, ...settled.stock] };
  }, start);
}

function settlePlot(
  state: GameState,
  catalog: Catalog,
  plotId: string,
  depot: DepotSnapshot,
): Stocked {
  const planting = state.garden.plots[plotId];
  if (!planting) return { state, stock: [] };
  const crop = findCrop(state, planting.cropId);
  const cleared = withoutPlot(state, plotId);
  if (!crop) return { state: cleared, stock: [] };
  if (isReady(crop, planting)) {
    const reaped = reap(state, [{ plotId, crop }], depot);
    return { ...reaped, state: withoutPlot(reaped.state, plotId) };
  }
  const free = freePlot(cleared, catalog, crop.plotType);
  if (free) return { state: withPlot(cleared, free.id, planting), stock: [] };
  return returnSeed(cleared, crop.seed, depot);
}

function freePlot(state: GameState, catalog: Catalog, plotType: PlotType): PlotDef | undefined {
  return plotsInForce(state, catalog).find(
    (plot) => plot.type === plotType && !state.garden.plots[plot.id],
  );
}

/** A seed material the master deleted returns nothing. */
function returnSeed(state: GameState, seed: StockRef, depot: DepotSnapshot): Stocked {
  const gained = gainStock(seed, 1, state, depot);
  if (!gained) return { state, stock: [] };
  const entry = { day: state.day, kind: 'garden_seed_returned', quantity: 1 } as const;
  return {
    state: withLog(gained.state, { ...entry, seed: gained.name, ...gained.lost }),
    stock: gained.stock,
  };
}

/** Empties the plot without harvesting and without giving the seed back. */
export function clearPlot(
  state: GameState,
  catalog: Catalog,
  plotId: string,
  depot: DepotSnapshot,
): StockedOutcome {
  if (!plotsInForce(state, catalog).some((plot) => plot.id === plotId)) {
    return fail('unknown_plot');
  }
  const planting = state.garden.plots[plotId];
  if (!planting) return fail('plot_empty');
  const seed = findCrop(state, planting.cropId)?.seed;
  const seedName = (seed && refName(seed, state, depot)) ?? planting.cropId;
  return stocked(
    withLog(withoutPlot(state, plotId), {
      day: state.day,
      kind: 'garden_cleared',
      plot: plotId,
      seed: seedName,
    }),
  );
}

function withPlot(state: GameState, plotId: string, planting: Planting): GameState {
  return setPlots(state, { ...state.garden.plots, [plotId]: planting });
}

function withoutPlot(state: GameState, plotId: string): GameState {
  const rest = Object.entries(state.garden.plots).filter(([id]) => id !== plotId);
  return setPlots(state, Object.fromEntries(rest));
}

function setPlots(state: GameState, plots: Garden['plots']): GameState {
  return { ...state, garden: { ...state.garden, plots } };
}

function setCrops(state: GameState, crops: Garden['crops']): GameState {
  return { ...state, garden: { ...state.garden, crops } };
}
