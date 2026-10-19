import { z } from 'zod';
import { angleRangesOverlap } from '../map/geometry';
import { layoutSchema, type MapLayout, type SlotDef } from '../map/layout';
import {
  ATTRIBUTE_IDS,
  assetManifestSchema,
  attributeDefSchema,
  buildingDefSchema,
  currencyDefSchema,
  gardenLayoutSchema,
  labLayoutSchema,
  materialsSchema,
  MAX_ATTRIBUTE,
  MAX_SKILL,
  missionsConfigSchema,
  npcsConfigSchema,
  researchBookSchema,
  shopSchema,
  skillDefSchema,
  tavernMenuSchema,
  walletsSeedSchema,
  worldsFileSchema,
  type AssetManifest,
  type AttributeDef,
  type BuildingDef,
  type CurrencyDef,
  type GardenLayout,
  type LabLayout,
  type JobDef,
  type Materials,
  type MissionsConfig,
  type NpcsConfig,
  type ResearchBook,
  type Shop,
  type SkillDef,
  type TavernMenu,
  type WalletsSeed,
  type World,
} from './schema';

/** The currency whose value is used to write costs ("coins": 150 means 150 of these). */
export const GOLD_CURRENCY_ID = 'gold';

/** Starting values for the records the master edits in game; they live in GameState afterwards. */
export interface Seed {
  readonly wallets: WalletsSeed;
  readonly materials: Materials;
  readonly research: ResearchBook;
  readonly shop: Shop;
}

/** All static game data, validated and cross-checked. */
export interface Catalog {
  /** Sorted by display order: the most valuable coin first. */
  readonly currencies: readonly CurrencyDef[];
  readonly buildings: readonly BuildingDef[];
  readonly layout: MapLayout;
  /** The fixed worlds of influence, in display order; the master only edits their percent. */
  readonly worlds: readonly World[];
  readonly assets: AssetManifest;
  readonly seed: Seed;
  /** NPC skills, in display order. */
  readonly skills: readonly SkillDef[];
  /** Adventure attributes (Força, Destreza, Poder Mágico), in display order. */
  readonly attributes: readonly AttributeDef[];
  readonly npcs: NpcsConfig;
  /** How mission rewards are shared out. */
  readonly missions: MissionsConfig;
  /** Dishes the tavern serves; empty where the menu is not shipped (the Edge Function). */
  readonly tavernMenu: TavernMenu;
  /** Plots of the herb garden, per level (the garden itself is state). */
  readonly garden: GardenLayout;
  /** Brewing stations of the arcane lab, per level (the brews are state). */
  readonly lab: LabLayout;
}

/** The building whose panel opens the menu, and whose level unlocks dishes. */
export const TAVERN_BUILDING_ID = 'tavern';

/** The building whose panel opens the herb garden. */
export const HERB_GARDEN_BUILDING_ID = 'herb_garden';

/** The building whose panel opens the potion workshop. */
export const ARCANE_LAB_BUILDING_ID = 'arcane_lab';

/** The building whose panel opens the mission board. */
export const GUILD_BUILDING_ID = 'guild';

export interface RawCatalog {
  currencies: unknown;
  buildings: unknown;
  layout: unknown;
  assets: unknown;
  wallets: unknown;
  materials: unknown;
  research: unknown;
  influence: unknown;
  skills: unknown;
  attributes: unknown;
  npcs: unknown;
  missions: unknown;
  shop: unknown;
  garden: unknown;
  lab: unknown;
  /** Display only, so the server catalog leaves it out. */
  tavernMenu?: unknown;
}

/**
 * Validates the JSON data files. Throws listing every problem at once, so a
 * typo in buildings.json is reported clearly instead of breaking at runtime.
 */
export function parseCatalog(raw: RawCatalog): Catalog {
  const currencies = parseFile('currencies.json', z.array(currencyDefSchema), raw.currencies);
  const catalog: Catalog = {
    currencies: [...currencies].sort((a, b) => a.order - b.order),
    buildings: parseFile('buildings.json', z.array(buildingDefSchema), raw.buildings),
    layout: parseFile('layout.json', layoutSchema, raw.layout),
    worlds: parseFile('influence.json', worldsFileSchema, raw.influence).worlds,
    assets: parseFile('assets.json', assetManifestSchema, raw.assets),
    seed: {
      wallets: parseFile('wallets.json', walletsSeedSchema, raw.wallets),
      materials: parseFile('materials.json', materialsSchema, raw.materials),
      research: parseFile('research.json', researchBookSchema, raw.research),
      shop: parseFile('shop.json', shopSchema, raw.shop),
    },
    skills: parseFile('skills.json', z.object({ skills: z.array(skillDefSchema) }), raw.skills)
      .skills,
    attributes: parseFile(
      'attributes.json',
      z.object({ attributes: z.array(attributeDefSchema) }),
      raw.attributes,
    ).attributes,
    npcs: parseFile('npcs.json', npcsConfigSchema, raw.npcs),
    missions: parseFile('missions.json', missionsConfigSchema, raw.missions),
    garden: parseFile('garden.json', gardenLayoutSchema, raw.garden),
    lab: parseFile('lab.json', labLayoutSchema, raw.lab),
    tavernMenu: parseFile('tavern_menu.json', tavernMenuSchema, raw.tavernMenu ?? { items: [] }),
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
  return catalog.layout.slots.find((s) => s.id === id);
}

/** Bronze worth of one gold coin, the unit costs are written in. */
export function goldInBronze(catalog: Catalog): number {
  return catalog.currencies.find((c) => c.id === GOLD_CURRENCY_ID)?.bronzeValue ?? 1;
}

/**
 * Resolves an image reference: an asset key from assets.json, or a URL typed by
 * the master. Anything else yields undefined so the UI draws a placeholder.
 */
export function resolveImage(catalog: Catalog, ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  const asset = catalog.assets.images[ref];
  if (asset) return asset;
  return /^(https?:\/\/|data:image\/|\/|assets\/)/.test(ref) ? ref : undefined;
}

function parseFile<T>(fileName: string, schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid ${fileName}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

function findReferenceProblems(catalog: Catalog): string[] {
  const buildingIds = new Set(catalog.buildings.map((b) => b.id));
  const assetKeys = new Set(Object.keys(catalog.assets.images));

  const missingAsset = (owner: string, key: string) =>
    assetKeys.has(key) ? [] : [`${owner}: asset "${key}" is not in assets.json`];

  // Material ids in costs are not checked here: the master can add and remove
  // materials in game, so an unknown one is reported as unavailable at build time.
  const buildingProblems = catalog.buildings.flatMap((b) => {
    const requirements = [...(b.requires ?? []), ...b.levels.flatMap((l) => l.requires ?? [])];
    return [
      ...missingAsset(b.id, b.icon),
      ...missingAsset(b.id, b.sprite),
      ...requirements
        .filter((r) => !buildingIds.has(r.building))
        .map((r) => `${b.id}: requires unknown building "${r.building}"`),
    ];
  });

  return [
    ...duplicates('building', catalog.buildings),
    ...duplicates('currency', catalog.currencies),
    ...duplicates('slot', catalog.layout.slots),
    ...duplicates('world', catalog.worlds),
    ...duplicates('skill', catalog.skills),
    ...ATTRIBUTE_IDS.filter((id) => !catalog.attributes.some((a) => a.id === id)).map(
      (id) => `attributes.json: attribute "${id}" is missing`,
    ),
    ...duplicates('attribute', catalog.attributes),
    ...jobProblems(catalog),
    ...heroTableProblems(
      'missions.json: attributePointsAbove10',
      catalog.missions.attributePointsAbove10,
      { from: 11, to: MAX_ATTRIBUTE, above: 10 },
    ),
    ...heroTableProblems('npcs.json: skillTenthsAbove10', catalog.npcs.skillTenthsAbove10, {
      from: 11,
      to: MAX_SKILL,
      above: 20,
    }),
    ...housingProblems(catalog),
    ...postSlotProblems(catalog),
    ...layoutProblems(catalog),
    ...currencyProblems(catalog.currencies),
    ...catalog.currencies.flatMap((c) => missingAsset(c.id, c.icon)),
    ...seedProblems(catalog),
    ...gardenProblems(catalog),
    ...labProblems(catalog),
    ...buildingProblems,
    ...menuProblems(catalog, missingAsset),
    ...(buildingIds.has(catalog.missions.guildBonus.building)
      ? []
      : [
          `missions.json: guildBonus uses unknown building "${catalog.missions.guildBonus.building}"`,
        ]),
  ];
}

/** Dishes need a known photo, known coins and a level the tavern can reach. */
function menuProblems(
  { tavernMenu, buildings, currencies }: Catalog,
  missingAsset: (owner: string, key: string) => string[],
): string[] {
  const { items } = tavernMenu;
  if (items.length === 0) return [];
  const tavern = buildings.find((b) => b.id === TAVERN_BUILDING_ID);
  const maxLevel = tavern?.levels.length ?? 0;
  const currencyIds = new Set(currencies.map((c) => c.id));
  return [
    ...(tavern ? [] : [`tavern_menu.json: building "${TAVERN_BUILDING_ID}" is missing`]),
    ...duplicates('menu item', items),
    ...items.flatMap((item) => [
      ...missingAsset(`menu ${item.id}`, item.image),
      ...Object.keys(item.price ?? {})
        .filter((id) => !currencyIds.has(id))
        .map((id) => `menu ${item.id}: unknown coin "${id}"`),
      ...((item.minLevel ?? 1) > maxLevel
        ? [`menu ${item.id}: minLevel ${item.minLevel} is above the tavern's ${maxLevel} levels`]
        : []),
    ]),
  ];
}

/** Posts must use known skills, and activity ids identify a post within a level. */
/**
 * An "explosive" table: one entry per level from `from` to `to`, each above
 * the one before, the first above what the linear rule gives at 10 (`above`).
 */
export function heroTableProblems(
  owner: string,
  table: Readonly<Record<string, number>>,
  { from, to, above }: { from: number; to: number; above: number },
): string[] {
  const levels = Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
  const extra = Object.keys(table).filter((key) => !levels.includes(key));
  const missing = levels.filter((level) => table[level] === undefined);
  if (extra.length > 0 || missing.length > 0) {
    return [`${owner} needs exactly the levels ${from} to ${to}`];
  }
  const values = levels.map((level) => table[level] ?? 0);
  const isGrowing = values.every((value, i) => value > (i === 0 ? above : (values[i - 1] ?? 0)));
  return isGrowing ? [] : [`${owner} must grow at every level, starting above ${above}`];
}

function jobProblems({ buildings, skills, npcs }: Catalog): string[] {
  const skillIds = new Set(skills.map((s) => s.id));
  const constructionActivity = npcs.construction.activity;
  const unknownSkill = (owner: string, job: JobDef) =>
    skillIds.has(job.skill)
      ? []
      : [`${owner}: post "${job.activity}" uses unknown skill "${job.skill}"`];
  const levelProblems = buildings.flatMap((b) =>
    b.levels.flatMap((level, index) => {
      const owner = `${b.id} level ${index + 1}`;
      const jobs = level.jobs ?? [];
      const ids = jobs.map((job) => ({ id: job.activity }));
      return [
        ...jobs.flatMap((job) => unknownSkill(owner, job)),
        ...duplicates(`${owner} post`, ids),
        ...(ids.some(({ id }) => id === constructionActivity)
          ? [`${owner}: post "${constructionActivity}" is reserved for constructions`]
          : []),
      ];
    }),
  );
  return [...unknownSkill('npcs.json', npcs.construction), ...levelProblems];
}

/** Housing lives only in the buildings npcs.json lists (the Alojamento). */
function housingProblems({ buildings, npcs }: Catalog): string[] {
  const housingIds = new Set(npcs.housingBuildings);
  return [
    ...npcs.housingBuildings
      .filter((id) => !buildings.some((b) => b.id === id))
      .map((id) => `npcs.json: housingBuildings lists unknown building "${id}"`),
    ...buildings
      .filter((b) => !housingIds.has(b.id) && b.levels.some((level) => level.housing))
      .map((b) => `${b.id}: housing is only allowed in npcs.json housingBuildings`),
  ];
}

/** A building with posts needs openings for every slot type it accepts, at each of its levels. */
function postSlotProblems({ buildings, npcs }: Catalog): string[] {
  return buildings
    .filter((b) => b.levels.some((level) => (level.jobs ?? []).length > 0))
    .flatMap((b) =>
      b.allowedSlots
        .filter((type) => (npcs.postSlots[type]?.length ?? 0) < b.levels.length)
        .map(
          (type) => `npcs.json: postSlots "${type}" needs ${b.levels.length} levels for ${b.id}`,
        ),
    );
}

/** Every slot type a building accepts must exist, and no slot may sit on a reserved stretch. */
function layoutProblems({ buildings, layout }: Catalog): string[] {
  const slotTypes = new Set(layout.slots.map((s) => s.type));
  const onReserved = (slot: SlotDef) =>
    slot.type === 'outer' &&
    layout.reserved.some((r) =>
      angleRangesOverlap([slot.arc.startAngle, slot.arc.endAngle], [r.startAngle, r.endAngle]),
    );
  return [
    ...buildings.flatMap((b) =>
      b.allowedSlots
        .filter((type) => !slotTypes.has(type))
        .map((type) => `${b.id}: allowedSlots "${type}" has no slot in layout.json`),
    ),
    ...layout.slots
      .filter(onReserved)
      .map((s) => `layout.json: ${s.id} overlaps a reserved stretch of the wall`),
  ];
}

function currencyProblems(currencies: readonly CurrencyDef[]): string[] {
  const hasGold = currencies.some((c) => c.id === GOLD_CURRENCY_ID);
  // Change is paid in smaller coins; a coin worth 1 bronze guarantees it is always exact.
  const hasUnitCoin = currencies.some((c) => c.bronzeValue === 1);
  return [
    ...(hasGold ? [] : [`currencies.json: a currency with id "${GOLD_CURRENCY_ID}" is required`]),
    ...(hasUnitCoin ? [] : ['currencies.json: one currency must have bronzeValue 1']),
  ];
}

function seedProblems({ currencies, seed }: Catalog): string[] {
  const currencyIds = new Set(currencies.map((c) => c.id));
  const wallets = [seed.wallets.camp, ...seed.wallets.characters.map((c) => c.wallet)];
  const materialCategories = new Set(seed.materials.categories.map((c) => c.id));
  const researchCategories = new Set(seed.research.categories.map((c) => c.id));
  const materialIds = new Set(seed.materials.items.map((m) => m.id));
  return [
    ...duplicates('character', seed.wallets.characters),
    ...duplicates('material', seed.materials.items),
    ...duplicates('material category', seed.materials.categories),
    ...duplicates('research', seed.research.entries),
    ...duplicates('research category', seed.research.categories),
    ...duplicates('shop item', seed.shop.items),
    ...seed.shop.items.flatMap((item) => [
      ...(item.kind === 'material' && !materialIds.has(item.materialId)
        ? [`shop.json: ${item.id} sells unknown material "${item.materialId}"`]
        : []),
      ...Object.keys(item.price)
        .filter((id) => !currencyIds.has(id))
        .map((id) => `shop.json: ${item.id} uses unknown currency "${id}"`),
    ]),
    ...wallets
      .flatMap((wallet) => Object.keys(wallet))
      .filter((id) => !currencyIds.has(id))
      .map((id) => `wallets.json: unknown currency "${id}"`),
    ...seed.materials.items
      .filter((m) => !materialCategories.has(m.category))
      .map((m) => `materials.json: ${m.id} uses unknown category "${m.category}"`),
    ...seed.research.entries
      .filter((r) => !researchCategories.has(r.category))
      .map((r) => `research.json: ${r.id} uses unknown category "${r.category}"`),
  ];
}

/** One layout entry per herb_garden level; a plot id keeps its type across levels so plantings survive an upgrade. */
function gardenProblems({ buildings, garden }: Catalog): string[] {
  const herbGarden = buildings.find((b) => b.id === HERB_GARDEN_BUILDING_ID);
  const typeById = new Map<string, string>();
  const reusedWithAnotherType = garden.levels
    .flatMap((level) => level.plots)
    .filter((plot) => {
      const known = typeById.get(plot.id);
      typeById.set(plot.id, known ?? plot.type);
      return known !== undefined && known !== plot.type;
    })
    .map((plot) => `garden.json: plot "${plot.id}" changes type between levels`);
  return [
    ...(herbGarden && herbGarden.levels.length !== garden.levels.length
      ? [
          `garden.json: has ${garden.levels.length} levels, ${HERB_GARDEN_BUILDING_ID} has ${herbGarden.levels.length}`,
        ]
      : []),
    ...garden.levels.flatMap((level, i) => duplicates(`garden level ${i + 1} plot`, level.plots)),
    ...reusedWithAnotherType,
  ];
}

/** One layout entry per arcane_lab level; a station keeps its type and never vanishes on an upgrade, so brews survive it. */
function labProblems({ buildings, lab }: Catalog): string[] {
  const arcaneLab = buildings.find((b) => b.id === ARCANE_LAB_BUILDING_ID);
  const typeById = new Map<string, string>();
  const reusedWithAnotherType = lab.levels
    .flatMap((level) => level.stations)
    .filter((station) => {
      const known = typeById.get(station.id);
      typeById.set(station.id, known ?? station.type);
      return known !== undefined && known !== station.type;
    })
    .map((station) => `lab.json: station "${station.id}" changes type between levels`);
  const vanished = lab.levels.slice(1).flatMap((level, i) => {
    const ids = new Set(level.stations.map((s) => s.id));
    return (lab.levels[i]?.stations ?? [])
      .filter((s) => !ids.has(s.id))
      .map((s) => `lab.json: station "${s.id}" of level ${i + 1} is missing from level ${i + 2}`);
  });
  return [
    ...(arcaneLab && arcaneLab.levels.length !== lab.levels.length
      ? [
          `lab.json: has ${lab.levels.length} levels, ${ARCANE_LAB_BUILDING_ID} has ${arcaneLab.levels.length}`,
        ]
      : []),
    ...lab.levels.flatMap((level, i) => duplicates(`lab level ${i + 1} station`, level.stations)),
    ...reusedWithAnotherType,
    ...vanished,
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
