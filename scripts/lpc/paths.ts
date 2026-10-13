import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..', '..');
/** The generator repository, cloned outside the game's git (vendor/ is ignored). */
export const GENERATOR_DIR = join(ROOT, 'vendor', 'lpc-generator');
export const GENERATOR_REPO =
  'https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator';
export const NPC_SOURCE_DIR = join(ROOT, 'art-sources', 'npcs');
export const NPC_SPRITES_FILE = join(ROOT, 'src', 'data', 'npc_sprites.json');

export function recipeFile(name: string): string {
  return join(NPC_SOURCE_DIR, name, 'character.json');
}
