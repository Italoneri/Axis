import { z } from 'zod';
import { NPC_HIDDEN_SPRITE, type AssetManifest, type Npc } from '../model/schema';
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

export type SpriteChoice = Pick<Npc, 'id' | 'sprite'>;

/**
 * The sprite chosen in game, then the one pinned in npc_sprites.json, then one
 * picked by the id's hash; a choice or pin whose sprite is gone is skipped.
 * Undefined for an NPC kept off the map (or when there is no sprite at all).
 */
export function spriteFor(
  npc: SpriteChoice,
  names: readonly string[],
  overrides: SpriteOverrides,
): string | undefined {
  if (npc.sprite === NPC_HIDDEN_SPRITE) return undefined;
  const preferred = [npc.sprite, overrides[npc.id]].find(
    (name) => name !== undefined && names.includes(name),
  );
  return preferred ?? names[hashString(npc.id) % names.length];
}

/** A sprite was chosen but is no longer in the project (the map uses the automatic pick). */
export function isMissingSprite(sprite: string | undefined, names: readonly string[]): boolean {
  return sprite !== undefined && sprite !== NPC_HIDDEN_SPRITE && !names.includes(sprite);
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
