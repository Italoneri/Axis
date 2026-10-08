import type { AmountBag } from '../model/schema';

/** Returns only the resources that are short, with how much is missing. Empty means affordable. */
export function missingResources(available: AmountBag, cost: AmountBag): AmountBag {
  return Object.fromEntries(
    Object.entries(cost)
      .map(([id, amount]) => [id, amount - (available[id] ?? 0)] as const)
      .filter(([, shortfall]) => shortfall > 0),
  );
}

export function canAfford(available: AmountBag, cost: AmountBag): boolean {
  return Object.keys(missingResources(available, cost)).length === 0;
}

/** Caller must check `canAfford` first; amounts are floored at zero as a safety net. */
export function subtractResources(available: AmountBag, cost: AmountBag): AmountBag {
  const result: Record<string, number> = { ...available };
  for (const [id, amount] of Object.entries(cost)) {
    result[id] = Math.max(0, (result[id] ?? 0) - amount);
  }
  return result;
}

/**
 * Applies signed amounts, never going below zero. Returns the delta that was
 * actually applied, which differs from the request when a removal hits zero.
 */
export function applyResourceDelta(
  available: AmountBag,
  delta: AmountBag,
): { resources: AmountBag; applied: AmountBag } {
  const applied = Object.fromEntries(
    Object.entries(delta)
      .map(([id, amount]) => [id, Math.max(amount, -(available[id] ?? 0))] as const)
      .filter(([, amount]) => amount !== 0),
  );
  const resources: Record<string, number> = { ...available };
  for (const [id, amount] of Object.entries(applied)) {
    resources[id] = (resources[id] ?? 0) + amount;
  }
  return { resources, applied };
}
