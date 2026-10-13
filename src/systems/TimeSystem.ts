import type { Catalog } from '../model/catalog';
import type { GameState, LogEntry, PlacedBuilding } from '../model/schema';
import { returnFromMissions } from './Missions';
import { settleNpcs } from './Npcs';
import { EMPTY_TALLY, tallyLog, workOneDay, type WorkTally } from './NpcWork';

export interface AdvanceResult {
  state: GameState;
  /** Slots whose construction finished during this advance, for completion effects. */
  completedSlotIds: string[];
}

interface Progress {
  state: GameState;
  tally: WorkTally;
  completedSlotIds: string[];
}

/**
 * Moves the calendar forward one day at a time. Each day runs, in order: NPC
 * wages, the effects of the posts, finished constructions, NPCs freed by them,
 * then NPCs back from missions. NPC work is logged once, summed over the whole advance.
 */
export function advanceDays(state: GameState, catalog: Catalog, days: number): AdvanceResult {
  if (!Number.isInteger(days) || days < 1) throw new Error(`invalid day count: ${days}`);
  const start: Progress = { state, tally: EMPTY_TALLY, completedSlotIds: [] };
  const end = Array.from({ length: days }, (_, i) => state.day + i + 1).reduce(
    (progress, day) => passDay(progress, catalog, day),
    start,
  );
  const day = end.state.day;
  return {
    state: {
      ...end.state,
      log: [...end.state.log, ...tallyLog(end.tally, day), { day, kind: 'days_advanced', days }],
    },
    completedSlotIds: end.completedSlotIds,
  };
}

function passDay(progress: Progress, catalog: Catalog, day: number): Progress {
  const worked = workOneDay({ ...progress.state, day }, catalog, progress.tally);
  const completed = completeConstructions(worked.state);
  return {
    state: returnFromMissions(settleNpcs(completed.state, catalog)),
    tally: worked.tally,
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
