import { findBuilding, findSlot, goldInBronze, type Catalog } from '../model/catalog';
import type {
  AmountBag,
  BuildingDef,
  BuildingLevel,
  Cost,
  GameState,
  PlacedBuilding,
  Requirement,
} from '../model/schema';
import { goldToBronze, pay } from './Coins';
import { consumeMaterials, findMaterial, materialNeeds } from './Materials';
import { campShortfall, CAMP, setWallet, type CoinShortfall } from './Wallets';

export type BlockReason =
  | { kind: 'wrong_slot_type' }
  | { kind: 'slot_occupied' }
  /** As many as `maxCount` already stand (or are being built) in the Axis. */
  | { kind: 'already_built'; buildingId: string; maxCount: number }
  | { kind: 'under_construction' }
  | { kind: 'max_level' }
  | { kind: 'missing_requirement'; requirement: Requirement }
  | ({ kind: 'missing_coins' } & CoinShortfall)
  | { kind: 'missing_materials'; missing: AmountBag }
  | { kind: 'unknown_materials'; ids: string[] };

export type BuildCheck =
  { ok: true; level: number; levelDef: BuildingLevel } | { ok: false; reasons: BlockReason[] };

export type BuildResult = { ok: true; state: GameState } | { ok: false; reasons: BlockReason[] };

export interface BuildOrder {
  slotId: string;
  buildingId: string;
}

/** Level whose effect currently applies: an upgrade in progress keeps the previous level active. */
export function activeLevel(placed: PlacedBuilding): number {
  return placed.status === 'done' ? placed.level : placed.level - 1;
}

/** How many copies of a building may stand in the Axis at once. */
export function maxCountOf(def: Pick<BuildingDef, 'maxCount'>): number {
  return def.maxCount ?? 1;
}

/** Copies of a building in the Axis, finished or under construction. */
export function placedCount(state: GameState, buildingId: string): number {
  return Object.values(state.slots).filter((placed) => placed.buildingId === buildingId).length;
}

/** Whether one more copy of `def` fits under its limit. */
export function hasRoomFor(state: GameState, def: BuildingDef): boolean {
  return placedCount(state, def.id) < maxCountOf(def);
}

/**
 * The stable number of a copy: the position of its slot among every slot the
 * building may use, in layout order. It never changes when another copy is
 * built or removed. Undefined for buildings that exist once.
 */
export function copyNumber(
  catalog: Catalog,
  buildingId: string,
  slotId: string,
): number | undefined {
  const def = findBuilding(catalog, buildingId);
  if (!def || maxCountOf(def) === 1) return undefined;
  const index = catalog.layout.slots
    .filter((slot) => def.allowedSlots.includes(slot.type))
    .findIndex((slot) => slot.id === slotId);
  return index < 0 ? undefined : index + 1;
}

/** Highest active level of a building anywhere in the base (0 when absent). */
export function builtLevel(state: GameState, buildingId: string): number {
  return Object.values(state.slots)
    .filter((placed) => placed.buildingId === buildingId)
    .reduce((best, placed) => Math.max(best, activeLevel(placed)), 0);
}

export function checkBuild(state: GameState, catalog: Catalog, order: BuildOrder): BuildCheck {
  const slot = findSlot(catalog, order.slotId);
  const def = findBuilding(catalog, order.buildingId);
  if (!slot || !def) throw new Error(`unknown slot or building: ${JSON.stringify(order)}`);

  const placementReasons: BlockReason[] = [
    ...(def.allowedSlots.includes(slot.type) ? [] : [{ kind: 'wrong_slot_type' } as const]),
    ...(state.slots[slot.id] ? [{ kind: 'slot_occupied' } as const] : []),
    // Most structures exist once; a few (the Alojamento) up to `maxCount`. Bonuses never stack.
    ...(hasRoomFor(state, def)
      ? []
      : [{ kind: 'already_built', buildingId: def.id, maxCount: maxCountOf(def) } as const]),
  ];
  return checkLevel(state, catalog, { def, level: 1 }, placementReasons);
}

export function checkUpgrade(state: GameState, catalog: Catalog, slotId: string): BuildCheck {
  const placed = state.slots[slotId];
  if (!placed) throw new Error(`upgrade on empty slot: ${slotId}`);
  const def = findBuilding(catalog, placed.buildingId);
  if (!def) throw new Error(`unknown building: ${placed.buildingId}`);

  if (placed.status === 'building') return { ok: false, reasons: [{ kind: 'under_construction' }] };
  if (placed.level >= def.levels.length) return { ok: false, reasons: [{ kind: 'max_level' }] };
  return checkLevel(state, catalog, { def, level: placed.level + 1 }, []);
}

export function startBuild(state: GameState, catalog: Catalog, order: BuildOrder): BuildResult {
  const check = checkBuild(state, catalog, order);
  if (!check.ok) return check;
  return { ok: true, state: beginConstruction(state, catalog, order, check, 'build_started') };
}

export function startUpgrade(state: GameState, catalog: Catalog, slotId: string): BuildResult {
  const check = checkUpgrade(state, catalog, slotId);
  if (!check.ok) return check;
  const buildingId = state.slots[slotId]?.buildingId ?? '';
  const order = { slotId, buildingId };
  return {
    ok: true,
    state: beginConstruction(state, catalog, order, check, 'upgrade_started'),
  };
}

/** Cost in bronze; `coins` in the JSON is a value in gold. */
export function costInBronze(catalog: Catalog, cost: Cost): number {
  return goldToBronze(cost.coins, goldInBronze(catalog));
}

/** Coin and material problems of a cost, against the Acampamento and the material stock. */
export function costReasons(state: GameState, catalog: Catalog, cost: Cost): BlockReason[] {
  const shortfall = campShortfall(state, catalog, costInBronze(catalog, cost));
  const { missing, unknown } = materialNeeds(state.materials, cost.materials ?? {});
  return [
    ...(shortfall ? [{ kind: 'missing_coins', ...shortfall } as const] : []),
    ...(Object.keys(missing).length > 0 ? [{ kind: 'missing_materials', missing } as const] : []),
    ...(unknown.length > 0 ? [{ kind: 'unknown_materials', ids: unknown } as const] : []),
  ];
}

function checkLevel(
  state: GameState,
  catalog: Catalog,
  { def, level }: { def: BuildingDef; level: number },
  priorReasons: BlockReason[],
): BuildCheck {
  const levelDef = def.levels[level - 1];
  if (!levelDef) return { ok: false, reasons: [...priorReasons, { kind: 'max_level' }] };

  const requirements = [...(def.requires ?? []), ...(levelDef.requires ?? [])];
  const reasons: BlockReason[] = [
    ...priorReasons,
    ...requirements
      .filter((req) => builtLevel(state, req.building) < req.minLevel)
      .map((requirement) => ({ kind: 'missing_requirement', requirement }) as const),
    ...costReasons(state, catalog, levelDef.cost),
  ];
  return reasons.length > 0 ? { ok: false, reasons } : { ok: true, level, levelDef };
}

function beginConstruction(
  state: GameState,
  catalog: Catalog,
  order: BuildOrder,
  { level, levelDef }: { level: number; levelDef: BuildingLevel },
  kind: 'build_started' | 'upgrade_started',
): GameState {
  const { slotId, buildingId } = order;
  const isInstant = levelDef.buildTime === 0;
  const placed: PlacedBuilding = isInstant
    ? { buildingId, level, status: 'done' }
    : {
        buildingId,
        level,
        status: 'building',
        startedOnDay: state.day,
        completesOnDay: state.day + levelDef.buildTime,
      };
  const paid = charge(state, catalog, levelDef.cost);
  const entries = [
    { day: state.day, kind, buildingId, level, slotId, paid: paid.receipt },
    ...(isInstant
      ? [{ day: state.day, kind: 'build_completed' as const, buildingId, level, slotId }]
      : []),
  ];
  return {
    ...paid.state,
    slots: { ...state.slots, [slotId]: placed },
    log: [...state.log, ...entries],
  };
}

/** Takes the cost from the Acampamento and the stock. Caller must check `costReasons` first. */
function charge(state: GameState, catalog: Catalog, cost: Cost) {
  const bronze = costInBronze(catalog, cost);
  const payment = pay(state.wallets.camp, bronze, catalog.currencies);
  if (!payment.ok) throw new Error(`charge: Acampamento is ${payment.missingBronze} bronze short`);
  const need = cost.materials ?? {};
  const materials = Object.fromEntries(
    Object.entries(need).map(([id, amount]) => [
      findMaterial(state.materials, id)?.name ?? id,
      amount,
    ]),
  );
  return {
    state: {
      ...setWallet(state, CAMP, payment.wallet),
      materials: consumeMaterials(state.materials, need),
    },
    receipt: { bronze, materials },
  };
}
