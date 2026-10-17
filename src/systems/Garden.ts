import type { Catalog } from '../model/catalog';
import { HERB_GARDEN_BUILDING_ID } from '../model/catalog';
import type { Crop, GameState, Garden, PlotDef, PlotType, Planting } from '../model/schema';
import { builtLevel } from './BuildSystem';
import { findMaterial } from './Materials';
import { fail, ok, type Outcome } from './outcome';

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

export function addCrop(state: GameState, crop: Crop): Outcome {
  if (!findMaterial(state.materials, crop.seedId)) return fail('not_found');
  if (!findMaterial(state.materials, crop.harvestId)) return fail('not_found');
  if (findCrop(state, crop.seedId)) return fail('crop_already_exists');
  return ok(setCrops(state, [...state.garden.crops, crop]));
}

export function updateCrop(state: GameState, seedId: string, fields: CropFields): Outcome {
  if (!findCrop(state, seedId)) return fail('not_found');
  if (!findMaterial(state.materials, fields.harvestId)) return fail('not_found');
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

function setCrops(state: GameState, crops: Garden['crops']): GameState {
  return { ...state, garden: { ...state.garden, crops } };
}
