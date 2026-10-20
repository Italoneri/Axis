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
import { refName, refQuantity, type DepotSnapshot } from '../../systems/Stock';
import { campShortfall } from '../../systems/Wallets';
import { t } from '../../i18n/pt-BR';

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

export function plotViews(state: GameState, catalog: Catalog, depot: DepotSnapshot): PlotView[] {
  return plotsInForce(state, catalog).map((plot) => plotView(state, plot, depot));
}

function plotView(state: GameState, plot: PlotDef, depot: DepotSnapshot): PlotView {
  const planting = state.garden.plots[plot.id];
  const crop = planting && findCrop(state, planting.cropId);
  if (!planting || !crop) return { kind: 'empty', plot };
  const harvestName = refName(crop.harvest, state, depot) ?? t.garden.missingItem;
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
  { actor, depot }: { actor: Actor; depot: DepotSnapshot },
): SeedOption[] {
  return cropsFor(state, plotType, depot).map((crop) =>
    seedOption(state, catalog, crop, { actor, depot }),
  );
}

function seedOption(
  state: GameState,
  catalog: Catalog,
  crop: Crop,
  { actor, depot }: { actor: Actor; depot: DepotSnapshot },
): SeedOption {
  const priceBronze = crop.rare ? null : toBronze(crop.price, catalog.currencies);
  const shortBronze =
    priceBronze === null
      ? null
      : (campShortfall(state, catalog, priceBronze)?.missingBronze ?? null);
  const owned = refQuantity(crop.seed, state, depot);
  return {
    crop,
    seedName: refName(crop.seed, state, depot) ?? t.garden.missingItem,
    harvestName: refName(crop.harvest, state, depot) ?? t.garden.missingItem,
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
