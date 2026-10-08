import { findBuilding, type Catalog } from '../model/catalog';
import type { GameState } from '../model/schema';
import { activeLevel } from './BuildSystem';

// Game master overrides for structures: they skip costs and prerequisites on
// purpose, because the GM is correcting the base to match what happened at the
// table. Resource edits live next to their rules (Wallets, Materials, Research, Influence).

export interface ForceOrder {
  slotId: string;
  buildingId: string;
  level: number;
}

/** Places a finished building at the given level, replacing whatever was in the slot. */
export function forceBuilding(state: GameState, catalog: Catalog, order: ForceOrder): GameState {
  const def = findBuilding(catalog, order.buildingId);
  if (!def) throw new Error(`unknown building: ${order.buildingId}`);
  if (!Number.isInteger(order.level) || order.level < 1 || order.level > def.levels.length) {
    throw new Error(`invalid level ${order.level} for ${order.buildingId}`);
  }

  const { slotId, buildingId, level } = order;
  return {
    ...state,
    slots: { ...state.slots, [slotId]: { buildingId, level, status: 'done' } },
    log: [...state.log, { day: state.day, kind: 'building_forced', buildingId, level }],
  };
}

export function removeBuilding(state: GameState, slotId: string): GameState {
  const placed = state.slots[slotId];
  if (!placed) return state;
  const slots = Object.fromEntries(Object.entries(state.slots).filter(([id]) => id !== slotId));
  return {
    ...state,
    slots,
    log: [
      ...state.log,
      {
        day: state.day,
        kind: 'building_removed',
        buildingId: placed.buildingId,
        level: Math.max(1, activeLevel(placed)),
      },
    ],
  };
}
