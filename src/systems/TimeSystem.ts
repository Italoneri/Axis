import type { Catalog } from '../model/catalog';
import type { GameState, LogEntry, PlacedBuilding } from '../model/schema';
import { growGarden, settleGarden } from './Garden';
import { brewLab, settleLab } from './Lab';
import { returnFromMissions } from './Missions';
import type { DepotSnapshot, StockMove } from './Stock';
import { settleNpcs } from './Npcs';
import { EMPTY_TALLY, tallyLog, workOneDay, type WorkTally } from './NpcWork';
import { EMPTY_PRODUCTION, produceOneDay, productionLog, type ProductionTally } from './Production';

export interface AdvanceResult {
  state: GameState;
  /** Slots whose construction finished during this advance, for completion effects. */
  completedSlotIds: string[];
  /** Depot gains from plots and stations that settled (always positive). */
  stock: StockMove[];
}

interface Progress {
  state: GameState;
  stock: StockMove[];
  tally: WorkTally;
  production: ProductionTally;
  completedSlotIds: string[];
}

/**
 * Moves the calendar forward one day at a time. Each day runs, in order: NPC
 * wages, the effects of the posts, passive production, finished constructions,
 * NPCs freed by them, then NPCs back from missions. NPC work and production are
 * logged once, summed over the whole advance.
 */
export function advanceDays(
  state: GameState,
  catalog: Catalog,
  days: number,
  depot: DepotSnapshot,
): AdvanceResult {
  if (!Number.isInteger(days) || days < 1) throw new Error(`invalid day count: ${days}`);
  const start: Progress = {
    state,
    stock: [],
    tally: EMPTY_TALLY,
    production: EMPTY_PRODUCTION,
    completedSlotIds: [],
  };
  const end = Array.from({ length: days }, (_, i) => state.day + i + 1).reduce(
    (progress, day) => passDay(progress, catalog, day, depot),
    start,
  );
  const day = end.state.day;
  return {
    state: {
      ...end.state,
      log: [
        ...end.state.log,
        ...tallyLog(end.tally, day),
        ...productionLog(end.production, catalog, end.state, day),
        { day, kind: 'days_advanced', days },
      ],
    },
    completedSlotIds: end.completedSlotIds,
    stock: end.stock,
  };
}

function passDay(
  progress: Progress,
  catalog: Catalog,
  day: number,
  depot: DepotSnapshot,
): Progress {
  const worked = workOneDay({ ...progress.state, day }, catalog, progress.tally);
  const produced = produceOneDay(worked.state, catalog, progress.production);
  // Growth and brewing run on the layout of the day, before the works that finish today change it.
  const grown = growGarden(produced.state, catalog);
  const brewed = brewLab(grown, catalog);
  const completed = completeConstructions(brewed);
  const gardened = settleGarden(completed.state, catalog, depot);
  // Works only raise levels, so this is a safeguard: brews really move after force/remove (applyCommand).
  const settled = settleLab(gardened.state, catalog, depot);
  return {
    state: returnFromMissions(settleNpcs(settled.state, catalog)),
    stock: [...progress.stock, ...gardened.stock, ...settled.stock],
    tally: worked.tally,
    production: produced.tally,
    completedSlotIds: [...progress.completedSlotIds, ...completed.slotIds],
  };
}

/** Finishes every construction due by `state.day`. */
function completeConstructions(state: GameState): { state: GameState; slotIds: string[] } {
  const due = Object.entries(state.slots)
    .flatMap(([slotId, placed]) =>
      placed.status === 'building' && placed.completesOnDay <= state.day
        ? [{ slotId, ...placed }]
        : [],
    )
    .sort((a, b) => a.completesOnDay - b.completesOnDay);
  if (due.length === 0) return { state, slotIds: [] };

  const completedSlots = Object.fromEntries(
    due.map(({ slotId, buildingId, level }): [string, PlacedBuilding] => [
      slotId,
      { buildingId, level, status: 'done' },
    ]),
  );
  const completionLog = due.map(({ completesOnDay, buildingId, level, slotId }): LogEntry => ({
    day: completesOnDay,
    kind: 'build_completed',
    buildingId,
    level,
    slotId,
  }));
  return {
    state: {
      ...state,
      slots: { ...state.slots, ...completedSlots },
      log: [...state.log, ...completionLog],
    },
    slotIds: due.map(({ slotId }) => slotId),
  };
}

/** Fraction of the construction already done (0..1); 1 for finished buildings. */
export function constructionProgress(placed: PlacedBuilding, currentDay: number): number {
  if (placed.status === 'done') return 1;
  const total = placed.completesOnDay - placed.startedOnDay;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (currentDay - placed.startedOnDay) / total));
}
