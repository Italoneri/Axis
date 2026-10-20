import type { GameState, StockRef } from '../model/schema';
import { groupItem, type Depot } from './Depot';
import { findMaterial } from './Materials';

// Stock refs: the garden and the lab take and put things either in a material
// or in an item of the group's Depósito (docs/plans/DEPOSITO.md). Depot items
// live outside the GameState, so rules only emit moves for them.

/** A change to one depot item. Player spends are strict (a shortage refuses), the master's clamp. */
export interface StockMove {
  itemId: string;
  delta: number;
  mode: 'strict' | 'clamp';
}

export function sameRef(a: StockRef, b: StockRef): boolean {
  return refKey(a) === refKey(b);
}

/** `m:<materialId>` or `d:<itemId>`: one string per ref, for maps and <select> values. */
export function refKey(ref: StockRef): string {
  return ref.source === 'material' ? `m:${ref.materialId}` : `d:${ref.itemId}`;
}

export function parseRefKey(key: string): StockRef | undefined {
  const id = key.slice(2);
  if (!id) return undefined;
  if (key.startsWith('m:')) return { source: 'material', materialId: id };
  if (key.startsWith('d:')) return { source: 'depot', itemId: id };
  return undefined;
}

/** Undefined when the material is gone or the item is not in use in the group's depot. */
export function refName(ref: StockRef, state: GameState, depot: Depot): string | undefined {
  return ref.source === 'material'
    ? findMaterial(state.materials, ref.materialId)?.name
    : groupItem(depot, ref.itemId)?.name;
}

export function refQuantity(ref: StockRef, state: GameState, depot: Depot): number {
  return ref.source === 'material'
    ? (findMaterial(state.materials, ref.materialId)?.quantity ?? 0)
    : (groupItem(depot, ref.itemId)?.quantity ?? 0);
}

export function refExists(ref: StockRef, state: GameState, depot: Depot): boolean {
  return refName(ref, state, depot) !== undefined;
}

/**
 * One move per item, in first-seen order; items that net to zero are dropped.
 * Spends on one item must share a mode: a command is either the master's or a player's.
 */
export function sumMoves(moves: readonly StockMove[]): StockMove[] {
  const merged = new Map<string, StockMove>();
  const spendModes = new Map<string, StockMove['mode']>();
  for (const move of moves) {
    if (move.delta < 0) {
      const seen = spendModes.get(move.itemId);
      if (seen && seen !== move.mode) throw new Error(`mixed spend modes on ${move.itemId}`);
      spendModes.set(move.itemId, move.mode);
    }
    const before = merged.get(move.itemId);
    merged.set(move.itemId, {
      itemId: move.itemId,
      delta: (before?.delta ?? 0) + move.delta,
      mode: 'strict',
    });
  }
  return [...merged.values()]
    .filter((move) => move.delta !== 0)
    .map((move) => ({ ...move, mode: spendModes.get(move.itemId) ?? 'strict' }));
}
