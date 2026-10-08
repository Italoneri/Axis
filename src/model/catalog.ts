import { z } from 'zod';
import {
  assetManifestSchema,
  buildingDefSchema,
  resourceDefSchema,
  slotsFileSchema,
  type AssetManifest,
  type BuildingDef,
  type ResourceDef,
  type SlotDef,
  type SlotsFile,
} from './schema';

/** All static game data, validated and cross-checked. */
export interface Catalog {
  readonly resources: readonly ResourceDef[];
  readonly buildings: readonly BuildingDef[];
  readonly slots: SlotsFile;
  readonly assets: AssetManifest;
}

export interface RawCatalog {
  resources: unknown;
  buildings: unknown;
  slots: unknown;
  assets: unknown;
}

/**
 * Validates the JSON data files. Throws listing every problem at once, so a
 * typo in buildings.json is reported clearly instead of breaking at runtime.
 */
export function parseCatalog(raw: RawCatalog): Catalog {
  const catalog: Catalog = {
    resources: parseFile('resources.json', z.array(resourceDefSchema), raw.resources),
    buildings: parseFile('buildings.json', z.array(buildingDefSchema), raw.buildings),
    slots: parseFile('slots.json', slotsFileSchema, raw.slots),
    assets: parseFile('assets.json', assetManifestSchema, raw.assets),
  };
  const problems = findReferenceProblems(catalog);
  if (problems.length > 0) {
    throw new Error(`Invalid game data:\n- ${problems.join('\n- ')}`);
  }
  return catalog;
}

export function findBuilding(catalog: Catalog, id: string): BuildingDef | undefined {
  return catalog.buildings.find((b) => b.id === id);
}

export function findSlot(catalog: Catalog, id: string): SlotDef | undefined {
  return catalog.slots.slots.find((s) => s.id === id);
}

/** Display-name lookups, falling back to the id so a missing entry is still readable. */
export function catalogNames(catalog: Catalog) {
  return {
    building: (id: string) => findBuilding(catalog, id)?.name ?? id,
    resource: (id: string) => catalog.resources.find((r) => r.id === id)?.name ?? id,
  };
}

function parseFile<T>(fileName: string, schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid ${fileName}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

function findReferenceProblems(catalog: Catalog): string[] {
  const resourceIds = new Set(catalog.resources.map((r) => r.id));
  const buildingIds = new Set(catalog.buildings.map((b) => b.id));
  const assetKeys = new Set(Object.keys(catalog.assets.images));

  const missingAsset = (owner: string, key: string) =>
    assetKeys.has(key) ? [] : [`${owner}: asset "${key}" is not in assets.json`];

  const buildingProblems = catalog.buildings.flatMap((b) => {
    const requirements = [...(b.requires ?? []), ...b.levels.flatMap((l) => l.requires ?? [])];
    const costKeys = b.levels.flatMap((l) => Object.keys(l.cost));
    return [
      ...missingAsset(b.id, b.icon),
      ...missingAsset(b.id, b.sprite),
      ...requirements
        .filter((r) => !buildingIds.has(r.building))
        .map((r) => `${b.id}: requires unknown building "${r.building}"`),
      ...costKeys
        .filter((key) => !resourceIds.has(key))
        .map((key) => `${b.id}: cost uses unknown resource "${key}"`),
    ];
  });

  return [
    ...duplicates('building', catalog.buildings),
    ...duplicates('resource', catalog.resources),
    ...duplicates('slot', catalog.slots.slots),
    ...catalog.resources.flatMap((r) => missingAsset(r.id, r.icon)),
    ...buildingProblems,
  ];
}

function duplicates(kind: string, items: readonly { id: string }[]): string[] {
  const seen = new Set<string>();
  return items.flatMap(({ id }) => {
    if (seen.has(id)) return [`duplicate ${kind} id "${id}"`];
    seen.add(id);
    return [];
  });
}
