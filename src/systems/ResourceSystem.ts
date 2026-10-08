import type { ResourceBag } from '../model/schema';

/** Returns only the resources that are short, with how much is missing. Empty means affordable. */
export function missingResources(available: ResourceBag, cost: ResourceBag): ResourceBag {
  return Object.fromEntries(
    Object.entries(cost)
      .map(([id, amount]) => [id, amount - (available[id] ?? 0)] as const)
      .filter(([, shortfall]) => shortfall > 0),
  );
}

export function canAfford(available: ResourceBag, cost: ResourceBag): boolean {
  return Object.keys(missingResources(available, cost)).length === 0;
}

/** Caller must check `canAfford` first; amounts are floored at zero as a safety net. */
export function subtractResources(available: ResourceBag, cost: ResourceBag): ResourceBag {
  const result: Record<string, number> = { ...available };
  for (const [id, amount] of Object.entries(cost)) {
    result[id] = Math.max(0, (result[id] ?? 0) - amount);
  }
  return result;
}
