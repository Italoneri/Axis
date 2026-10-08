import type { Catalog } from '../model/catalog';
import type { GameState } from '../model/schema';
import { builtLevel } from './BuildSystem';

export interface ActiveBonus {
  buildingId: string;
  name: string;
  level: number;
  /** Effects of every level reached so far: level bonuses accumulate. */
  effects: string[];
}

/** Bonuses currently in force, in catalog order, for players to consult during the session. */
export function activeBonuses(state: GameState, catalog: Catalog): ActiveBonus[] {
  return catalog.buildings.flatMap((def) => {
    const level = builtLevel(state, def.id);
    if (level === 0) return [];
    const effects = def.levels.slice(0, level).map((l) => l.effect);
    return [{ buildingId: def.id, name: def.name, level, effects }];
  });
}
