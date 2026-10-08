import { findBuilding, findSlot, type Catalog } from '../model/catalog';
import type {
  BuildingDef,
  BuildingLevel,
  GameState,
  PlacedBuilding,
  Requirement,
  ResourceBag,
} from '../model/schema';
import { missingResources, subtractResources } from './ResourceSystem';

export type BlockReason =
  | { kind: 'wrong_slot_type' }
  | { kind: 'slot_occupied' }
  | { kind: 'already_built' }
  | { kind: 'under_construction' }
  | { kind: 'max_level' }
  | { kind: 'missing_requirement'; requirement: Requirement }
  | { kind: 'missing_resources'; missing: ResourceBag };

export type BuildCheck =
  { ok: true; level: number; levelDef: BuildingLevel } | { ok: false; reasons: BlockReason[] };

export type BuildResult = { ok: true; state: GameState } | { ok: false; reasons: BlockReason[] };

export interface BuildOrder {
  slotId: string;
  buildingId: string;
  actor?: string | undefined;
}

/** Level whose effect currently applies: an upgrade in progress keeps the previous level active. */
export function activeLevel(placed: PlacedBuilding): number {
  return placed.status === 'done' ? placed.level : placed.level - 1;
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
    // Each structure exists once in the base, so bonuses never stack.
    ...(isPlacedAnywhere(state, def.id) ? [{ kind: 'already_built' } as const] : []),
  ];
  return checkLevel(state, def, 1, placementReasons);
}

export function checkUpgrade(state: GameState, catalog: Catalog, slotId: string): BuildCheck {
  const placed = state.slots[slotId];
  if (!placed) throw new Error(`upgrade on empty slot: ${slotId}`);
  const def = findBuilding(catalog, placed.buildingId);
  if (!def) throw new Error(`unknown building: ${placed.buildingId}`);

  if (placed.status === 'building') return { ok: false, reasons: [{ kind: 'under_construction' }] };
  if (placed.level >= def.levels.length) return { ok: false, reasons: [{ kind: 'max_level' }] };
  return checkLevel(state, def, placed.level + 1, []);
}

export function startBuild(state: GameState, catalog: Catalog, order: BuildOrder): BuildResult {
  const check = checkBuild(state, catalog, order);
  if (!check.ok) return check;
  return { ok: true, state: beginConstruction(state, order, check, 'build_started') };
}

export function startUpgrade(
  state: GameState,
  catalog: Catalog,
  slotId: string,
  actor?: string,
): BuildResult {
  const check = checkUpgrade(state, catalog, slotId);
  if (!check.ok) return check;
  const buildingId = state.slots[slotId]?.buildingId ?? '';
  const order = { slotId, buildingId, actor };
  return { ok: true, state: beginConstruction(state, order, check, 'upgrade_started') };
}

function checkLevel(
  state: GameState,
  def: BuildingDef,
  level: number,
  priorReasons: BlockReason[],
): BuildCheck {
  const levelDef = def.levels[level - 1];
  if (!levelDef) return { ok: false, reasons: [...priorReasons, { kind: 'max_level' }] };

  const requirements = [...(def.requires ?? []), ...(levelDef.requires ?? [])];
  const missing = missingResources(state.resources, levelDef.cost);
  const reasons: BlockReason[] = [
    ...priorReasons,
    ...requirements
      .filter((req) => builtLevel(state, req.building) < req.minLevel)
      .map((requirement) => ({ kind: 'missing_requirement', requirement }) as const),
    ...(Object.keys(missing).length > 0 ? [{ kind: 'missing_resources', missing } as const] : []),
  ];
  return reasons.length > 0 ? { ok: false, reasons } : { ok: true, level, levelDef };
}

function isPlacedAnywhere(state: GameState, buildingId: string): boolean {
  return Object.values(state.slots).some((placed) => placed.buildingId === buildingId);
}

function beginConstruction(
  state: GameState,
  order: BuildOrder,
  { level, levelDef }: { level: number; levelDef: BuildingLevel },
  kind: 'build_started' | 'upgrade_started',
): GameState {
  const { slotId, buildingId, actor } = order;
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
  const entries = [
    { day: state.day, kind, buildingId, level, actor },
    ...(isInstant ? [{ day: state.day, kind: 'build_completed' as const, buildingId, level }] : []),
  ];
  return {
    ...state,
    resources: subtractResources(state.resources, levelDef.cost),
    slots: { ...state.slots, [slotId]: placed },
    log: [...state.log, ...entries],
  };
}
