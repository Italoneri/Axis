import type { GameState, LogEntry, PlacedBuilding } from '../model/schema';

export interface AdvanceResult {
  state: GameState;
  /** Slots whose construction finished during this advance, for completion effects. */
  completedSlotIds: string[];
}

/** Moves the calendar forward and completes every construction due by the new day. */
export function advanceDays(state: GameState, days: number): AdvanceResult {
  if (!Number.isInteger(days) || days < 1) throw new Error(`invalid day count: ${days}`);
  const day = state.day + days;

  const due = Object.entries(state.slots)
    .flatMap(([slotId, placed]) =>
      placed.status === 'building' && placed.completesOnDay <= day ? [{ slotId, ...placed }] : [],
    )
    .sort((a, b) => a.completesOnDay - b.completesOnDay);

  const completedSlots = Object.fromEntries(
    due.map(({ slotId, buildingId, level }): [string, PlacedBuilding] => [
      slotId,
      { buildingId, level, status: 'done' },
    ]),
  );
  const completionLog = due.map(({ completesOnDay, buildingId, level }): LogEntry => ({
    day: completesOnDay,
    kind: 'build_completed',
    buildingId,
    level,
  }));

  return {
    state: {
      ...state,
      day,
      slots: { ...state.slots, ...completedSlots },
      log: [...state.log, ...completionLog, { day, kind: 'days_advanced', days }],
    },
    completedSlotIds: due.map(({ slotId }) => slotId),
  };
}

/** Fraction of the construction already done (0..1); 1 for finished buildings. */
export function constructionProgress(placed: PlacedBuilding, currentDay: number): number {
  if (placed.status === 'done') return 1;
  const total = placed.completesOnDay - placed.startedOnDay;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (currentDay - placed.startedOnDay) / total));
}
