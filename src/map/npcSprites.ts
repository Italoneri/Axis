import { z } from 'zod';
import type { AssetManifest } from '../model/schema';
import { hashString } from './random';

// Walking NPCs use sheets exported by the Universal LPC Spritesheet Generator,
// registered by `npm run import:npcs` as `npc.<name>.walk` and `npc.<name>.idle`.

export const NPC_SHEET_PREFIX = 'npc.';
/** LPC frames are 64×64 squares. */
export const NPC_FRAME_SIZE = 64;

/** Sheet rows, top to bottom. */
export const FACINGS = ['north', 'west', 'south', 'east'] as const;
export type Facing = (typeof FACINGS)[number];

export interface SpriteSheets {
  readonly walk: string;
  readonly idle: string;
}

export const spriteOverridesSchema = z.record(z.string().min(1), z.string().min(1));
export type SpriteOverrides = z.infer<typeof spriteOverridesSchema>;

export function isNpcSheetKey(key: string): boolean {
  return key.startsWith(NPC_SHEET_PREFIX);
}

export function sheetKeys(name: string): SpriteSheets {
  return { walk: `${NPC_SHEET_PREFIX}${name}.walk`, idle: `${NPC_SHEET_PREFIX}${name}.idle` };
}

/** Sprite names with a walk sheet, sorted so every browser draws from the same list. */
export function spriteNames(assets: AssetManifest): string[] {
  const names = Object.keys(assets.images)
    .filter(isNpcSheetKey)
    .map((key) => key.slice(NPC_SHEET_PREFIX.length).replace(/\.[^.]+$/, ''));
  return [...new Set(names)].filter((name) => sheetKeys(name).walk in assets.images).sort();
}

/** The pinned sprite (npc_sprites.json) when it exists, otherwise one picked by the id's hash. */
export function spriteFor(
  npcId: string,
  names: readonly string[],
  overrides: SpriteOverrides,
): string | undefined {
  const pinned = overrides[npcId];
  if (pinned !== undefined && names.includes(pinned)) return pinned;
  return names[hashString(npcId) % names.length];
}

/** Columns up to the last one holding a drawn frame in any row; the rest of the sheet is padding. */
export function usedColumns(
  columns: number,
  rows: number,
  hasPixels: (column: number, row: number) => boolean,
): number {
  for (let column = columns - 1; column >= 0; column--) {
    for (let row = 0; row < rows; row++) {
      if (hasPixels(column, row)) return column + 1;
    }
  }
  return 0;
}

/** Sheet row for a movement in screen space (y grows downward); ties go to the vertical rows. */
export function facingFor(dx: number, dy: number): Facing {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'east' : 'west';
  return dy > 0 ? 'south' : 'north';
}
