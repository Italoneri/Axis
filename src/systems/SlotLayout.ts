import type { SlotsFile } from '../model/schema';

const PRECISION = 10_000;

/** Moves one slot to a normalized position, clamped to the map and rounded to keep the JSON tidy. */
export function moveSlot(file: SlotsFile, slotId: string, x: number, y: number): SlotsFile {
  return {
    ...file,
    slots: file.slots.map((slot) =>
      slot.id === slotId ? { ...slot, x: normalize(x), y: normalize(y) } : slot,
    ),
  };
}

export function serializeSlots(file: SlotsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

function normalize(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * PRECISION) / PRECISION;
}
