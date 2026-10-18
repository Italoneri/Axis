import type { Actor } from '../../commands/schema';
import type { Catalog } from '../../model/catalog';
import type { Crop, GameState, PlotDef, PlotType } from '../../model/schema';
import { toBronze } from '../../systems/Coins';
import {
  cropsFor,
  findCrop,
  GROWTH_TENTHS_PER_DAY,
  isReady,
  plotsInForce,
} from '../../systems/Garden';
import { findMaterial } from '../../systems/Materials';
import { campShortfall } from '../../systems/Wallets';

export type PlotView =
  | { kind: 'empty'; plot: PlotDef }
  | {
      kind: 'growing';
      plot: PlotDef;
      crop: Crop;
      harvestName: string;
      daysLeft: number;
      /** 0..1 */
      progress: number;
    }
  | { kind: 'ready'; plot: PlotDef; crop: Crop; harvestName: string };

export function plotViews(state: GameState, catalog: Catalog): PlotView[] {
  return plotsInForce(state, catalog).map((plot) => plotView(state, plot));
}

function plotView(state: GameState, plot: PlotDef): PlotView {
  const planting = state.garden.plots[plot.id];
  const crop = planting && findCrop(state, planting.seedId);
  if (!planting || !crop) return { kind: 'empty', plot };
  const harvestName = findMaterial(state.materials, crop.harvestId)?.name ?? crop.harvestId;
  if (isReady(crop, planting)) return { kind: 'ready', plot, crop, harvestName };
  const totalTenths = crop.days * GROWTH_TENTHS_PER_DAY;
  return {
    kind: 'growing',
    plot,
    crop,
    harvestName,
    daysLeft: Math.ceil((totalTenths - planting.growthTenths) / GROWTH_TENTHS_PER_DAY),
    progress: planting.growthTenths / totalTenths,
  };
}

export function gardenSummary(views: readonly PlotView[]): {
  ready: number;
  growing: number;
  empty: number;
} {
  const count = (kind: PlotView['kind']) => views.filter((view) => view.kind === kind).length;
  return { ready: count('ready'), growing: count('growing'), empty: count('empty') };
}

export type SeedAction = 'plant' | 'buy' | 'rare_locked' | 'camp_short';

export interface SeedOption {
  crop: Crop;
  seedName: string;
  harvestName: string;
  owned: number;
  action: SeedAction;
  priceBronze: number | null;
  shortBronze: number | null;
}

/** Every crop of the plot type, including seeds the camp does not hold. */
export function seedOptions(
  state: GameState,
  catalog: Catalog,
  plotType: PlotType,
  actor: Actor,
): SeedOption[] {
  return cropsFor(state, plotType).map((crop) => seedOption(state, catalog, crop, actor));
}

function seedOption(state: GameState, catalog: Catalog, crop: Crop, actor: Actor): SeedOption {
  const seed = findMaterial(state.materials, crop.seedId);
  const priceBronze = crop.rare ? null : toBronze(crop.price, catalog.currencies);
  const shortBronze =
    priceBronze === null
      ? null
      : (campShortfall(state, catalog, priceBronze)?.missingBronze ?? null);
  const owned = seed?.quantity ?? 0;
  return {
    crop,
    seedName: seed?.name ?? crop.seedId,
    harvestName: findMaterial(state.materials, crop.harvestId)?.name ?? crop.harvestId,
    owned,
    action: seedAction(owned, crop, shortBronze, actor),
    priceBronze,
    shortBronze,
  };
}

function seedAction(
  owned: number,
  crop: Crop,
  shortBronze: number | null,
  actor: Actor,
): SeedAction {
  if (owned >= 1 || actor.role === 'master') return 'plant';
  if (crop.rare) return 'rare_locked';
  return shortBronze === null ? 'buy' : 'camp_short';
}

export type GardenTab = 'garden' | 'crops';

/** Only the master manages crops; players get no tab bar at all. */
export function visibleTabs(isMaster: boolean): readonly GardenTab[] {
  return isMaster ? ['garden', 'crops'] : [];
}
