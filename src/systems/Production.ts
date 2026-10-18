import type { Catalog } from '../model/catalog';
import type { GameState, LogEntry } from '../model/schema';
import { levelInForce } from './BuildSystem';

// One day of passive production: every building whose level in force has
// `produces` adds those units to materials the master still has.

/** Whole units produced so far in an advance, by building id and material id. */
export type ProductionTally = ReadonlyMap<
  string,
  { buildingId: string; materialId: string; amount: number }
>;

export const EMPTY_PRODUCTION: ProductionTally = new Map();

interface ProductionDay {
  state: GameState;
  tally: ProductionTally;
}

/** One day: every slot whose level in force has `produces` adds it to existing materials. */
export function produceOneDay(
  state: GameState,
  catalog: Catalog,
  tally: ProductionTally,
): ProductionDay {
  return Object.entries(state.slots).reduce<ProductionDay>(
    (day, [slotId, placed]) => {
      const produces = levelInForce(day.state, catalog, slotId)?.produces ?? {};
      return Object.entries(produces).reduce(
        (acc, [materialId, amount]) =>
          addUnits(acc, { buildingId: placed.buildingId, materialId, amount }),
        day,
      );
    },
    { state, tally },
  );
}

export function productionLog(
  tally: ProductionTally,
  _catalog: Catalog,
  state: GameState,
  day: number,
): LogEntry[] {
  return [...tally.values()].flatMap(({ buildingId, materialId, amount }): LogEntry[] => {
    const material = state.materials.items.find((m) => m.id === materialId);
    return material && amount > 0
      ? [{ day, kind: 'building_produced', buildingId, material: material.name, quantity: amount }]
      : [];
  });
}

interface Units {
  buildingId: string;
  materialId: string;
  amount: number;
}

/** A material the master deleted takes nothing. */
function addUnits({ state, tally }: ProductionDay, units: Units): ProductionDay {
  const material = state.materials.items.find((m) => m.id === units.materialId);
  if (!material || units.amount <= 0) return { state, tally };

  const items = state.materials.items.map((m) =>
    m.id === material.id ? { ...m, quantity: m.quantity + units.amount } : m,
  );
  const key = `${units.buildingId}/${units.materialId}`;
  const amount = (tally.get(key)?.amount ?? 0) + units.amount;
  return {
    state: { ...state, materials: { ...state.materials, items } },
    tally: new Map(tally).set(key, { ...units, amount }),
  };
}
