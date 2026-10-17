import type { Actor } from '../commands/schema';
import type { Catalog } from '../model/catalog';
import { HERB_GARDEN_BUILDING_ID } from '../model/catalog';
import type { Crop, GameState, Garden, PlotDef, PlotType, Planting } from '../model/schema';
import { builtLevel } from './BuildSystem';
import { toBronze } from './Coins';
import { addStock, findMaterial } from './Materials';
import { fail, ok, withLog, type ActionError, type Outcome } from './outcome';
import { CAMP, chargeWallet } from './Wallets';

export { HERB_GARDEN_BUILDING_ID };

/** A planting is ready when `growthTenths` reaches `days` times this. */
export const GROWTH_TENTHS_PER_DAY = 10;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type CropFields = DistributiveOmit<Crop, 'seedId'>;

export function gardenLevel(state: GameState): number {
  return builtLevel(state, HERB_GARDEN_BUILDING_ID);
}

/** Plots of the level in force: an upgrade in progress keeps the previous layout. */
export function plotsInForce(state: GameState, catalog: Catalog): readonly PlotDef[] {
  const level = gardenLevel(state);
  return level < 1 ? [] : (catalog.garden.levels[level - 1]?.plots ?? []);
}

export function findCrop(state: GameState, seedId: string): Crop | undefined {
  return state.garden.crops.find((crop) => crop.seedId === seedId);
}

export function isReady(crop: Crop, planting: Planting): boolean {
  return planting.growthTenths >= crop.days * GROWTH_TENTHS_PER_DAY;
}

/** Crops for a plot type whose seed and harvest materials both still exist, by seed name. */
export function cropsFor(state: GameState, plotType: PlotType): Crop[] {
  const seedName = (crop: Crop) => findMaterial(state.materials, crop.seedId)?.name ?? '';
  return state.garden.crops
    .filter(
      (crop) =>
        crop.plotType === plotType &&
        findMaterial(state.materials, crop.seedId) !== undefined &&
        findMaterial(state.materials, crop.harvestId) !== undefined,
    )
    .sort((a, b) => seedName(a).localeCompare(seedName(b)));
}

function isFreeCommonCrop(crop: Crop | CropFields, catalog: Catalog): boolean {
  return !crop.rare && toBronze(crop.price, catalog.currencies) === 0;
}

export function addCrop(state: GameState, catalog: Catalog, crop: Crop): Outcome {
  if (!findMaterial(state.materials, crop.seedId)) return fail('not_found');
  if (!findMaterial(state.materials, crop.harvestId)) return fail('not_found');
  if (findCrop(state, crop.seedId)) return fail('crop_already_exists');
  if (isFreeCommonCrop(crop, catalog)) return fail('empty_price');
  return ok(setCrops(state, [...state.garden.crops, crop]));
}

export function updateCrop(
  state: GameState,
  catalog: Catalog,
  seedId: string,
  fields: CropFields,
): Outcome {
  if (!findCrop(state, seedId)) return fail('not_found');
  if (!findMaterial(state.materials, fields.harvestId)) return fail('not_found');
  if (isFreeCommonCrop(fields, catalog)) return fail('empty_price');
  const next: Crop = { ...fields, seedId };
  return ok(
    setCrops(
      state,
      state.garden.crops.map((crop) => (crop.seedId === seedId ? next : crop)),
    ),
  );
}

export function removeCrop(state: GameState, seedId: string): Outcome {
  if (!findCrop(state, seedId)) return fail('not_found');
  const inUse = Object.values(state.garden.plots).some((planting) => planting.seedId === seedId);
  if (inUse) return fail('crop_in_use');
  return ok(
    setCrops(
      state,
      state.garden.crops.filter((crop) => crop.seedId !== seedId),
    ),
  );
}

export interface PlantOrder {
  plotId: string;
  seedId: string;
  buy: boolean;
}

export function plant(
  state: GameState,
  catalog: Catalog,
  order: PlantOrder,
  actor: Actor,
): Outcome {
  if (gardenLevel(state) < 1) return fail('garden_not_built');
  const plot = plotsInForce(state, catalog).find((p) => p.id === order.plotId);
  if (!plot) return fail('unknown_plot');
  if (state.garden.plots[plot.id]) return fail('plot_occupied');
  const crop = findCrop(state, order.seedId);
  const seed = findMaterial(state.materials, order.seedId);
  if (!crop || !seed || !findMaterial(state.materials, crop.harvestId)) return fail('not_found');
  if (crop.plotType !== plot.type) return fail('wrong_plot_type');

  const sourced = sourceSeed(state, catalog, crop, order.buy, actor);
  if (!sourced.ok) return sourced;
  const planted = withPlot(sourced.state, plot.id, { seedId: crop.seedId, growthTenths: 0 });
  return ok(
    withLog(planted, {
      day: state.day,
      kind: 'garden_planted',
      plot: plot.id,
      seed: seed.name,
      bronze: sourced.bronze,
    }),
  );
}

type SeedSource =
  { ok: true; state: GameState; bronze: number } | { ok: false; error: ActionError };

/** An owned seed first, then the master's free one, then (common crops only) a purchase by the camp. */
function sourceSeed(
  state: GameState,
  catalog: Catalog,
  crop: Crop,
  buy: boolean,
  actor: Actor,
): SeedSource {
  const stock = findMaterial(state.materials, crop.seedId)?.quantity ?? 0;
  if (stock >= 1) return { ok: true, state: addStock(state, crop.seedId, -1), bronze: 0 };
  if (actor.role === 'master') return { ok: true, state, bronze: 0 };
  if (!buy) return { ok: false, error: 'no_seed' };
  if (crop.rare) return { ok: false, error: 'rare_not_for_sale' };
  const bronze = toBronze(crop.price, catalog.currencies);
  const paid = chargeWallet(state, catalog, CAMP, bronze);
  return paid.ok ? { ok: true, state: paid.state, bronze } : paid;
}

interface ReadyPlot {
  plotId: string;
  crop: Crop;
}

/** `plotId` undefined harvests every ready plot in force; `nothing_changed` when none is ready. */
export function harvest(state: GameState, catalog: Catalog, plotId: string | undefined): Outcome {
  const inForce = plotsInForce(state, catalog).map((plot) => plot.id);
  if (plotId === undefined) {
    const ready = inForce.flatMap((id) => readyPlot(state, id));
    return ready.length === 0 ? fail('nothing_changed') : ok(reap(state, ready));
  }
  if (!inForce.includes(plotId)) return fail('unknown_plot');
  const planting = state.garden.plots[plotId];
  if (!planting) return fail('plot_empty');
  const crop = findCrop(state, planting.seedId);
  if (!crop) return fail('not_found');
  if (!isReady(crop, planting)) return fail('not_ready');
  return ok(reap(state, [{ plotId, crop }]));
}

function readyPlot(state: GameState, plotId: string): ReadyPlot[] {
  const planting = state.garden.plots[plotId];
  const crop = planting && findCrop(state, planting.seedId);
  return planting && crop && isReady(crop, planting) ? [{ plotId, crop }] : [];
}

/** Common crops start growing again; rare ones free the plot. A material that is gone yields nothing. */
function reap(state: GameState, plots: readonly ReadyPlot[]): GameState {
  const reset = plots.reduce(
    (current, { plotId, crop }) =>
      crop.rare
        ? withoutPlot(current, plotId)
        : withPlot(current, plotId, { seedId: crop.seedId, growthTenths: 0 }),
    state,
  );
  const totals = plots.reduce(
    (sum, { crop }) => sum.set(crop.harvestId, (sum.get(crop.harvestId) ?? 0) + crop.yield),
    new Map<string, number>(),
  );
  return [...totals].reduce(
    (current, [materialId, quantity]) => deliver(current, materialId, quantity),
    reset,
  );
}

function deliver(state: GameState, materialId: string, quantity: number): GameState {
  const material = findMaterial(state.materials, materialId);
  if (!material) return state;
  return withLog(addStock(state, materialId, quantity), {
    day: state.day,
    kind: 'garden_harvested',
    material: material.name,
    quantity,
  });
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
 */
export function settleGarden(state: GameState, catalog: Catalog): GameState {
  const inForce = new Set(plotsInForce(state, catalog).map((plot) => plot.id));
  const vanished = Object.keys(state.garden.plots).filter((plotId) => !inForce.has(plotId));
  return vanished.reduce((current, plotId) => settlePlot(current, catalog, plotId), state);
}

function settlePlot(state: GameState, catalog: Catalog, plotId: string): GameState {
  const planting = state.garden.plots[plotId];
  if (!planting) return state;
  const crop = findCrop(state, planting.seedId);
  const cleared = withoutPlot(state, plotId);
  if (!crop) return cleared;
  if (isReady(crop, planting)) return withoutPlot(reap(state, [{ plotId, crop }]), plotId);
  const free = freePlot(cleared, catalog, crop.plotType);
  return free ? withPlot(cleared, free.id, planting) : returnSeed(cleared, crop.seedId);
}

function freePlot(state: GameState, catalog: Catalog, plotType: PlotType): PlotDef | undefined {
  return plotsInForce(state, catalog).find(
    (plot) => plot.type === plotType && !state.garden.plots[plot.id],
  );
}

/** A seed material the master deleted returns nothing. */
function returnSeed(state: GameState, seedId: string): GameState {
  const seed = findMaterial(state.materials, seedId);
  if (!seed) return state;
  return withLog(addStock(state, seedId, 1), {
    day: state.day,
    kind: 'garden_seed_returned',
    seed: seed.name,
    quantity: 1,
  });
}

/** Empties the plot without harvesting and without giving the seed back. */
export function clearPlot(state: GameState, catalog: Catalog, plotId: string): Outcome {
  if (!plotsInForce(state, catalog).some((plot) => plot.id === plotId)) {
    return fail('unknown_plot');
  }
  const planting = state.garden.plots[plotId];
  if (!planting) return fail('plot_empty');
  const seedName = findMaterial(state.materials, planting.seedId)?.name ?? planting.seedId;
  return ok(
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
