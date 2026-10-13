/**
 * Checks the sprites built by lpc:build that live in art-sources/npcs.
 * aventureira/_site/ holds what the generator website exported for the same recipe.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { incompleteCreditRows } from './credits';
import { NPC_SOURCE_DIR, recipeFile } from './paths';
import { decodePng, differentPixels } from './png';
import { parseRecipe } from './recipe';

const SITE_EXPORT = join(NPC_SOURCE_DIR, 'aventureira', '_site');
const builtSprites = readdirSync(NPC_SOURCE_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(recipeFile(entry.name)))
  .map((entry) => entry.name);

describe('aventureira built locally matches the website export', () => {
  it.each(['walk', 'idle'])('%s.png is identical pixel by pixel', (sheet) => {
    const site = decodePng(readFileSync(join(SITE_EXPORT, `${sheet}.png`)));
    const built = decodePng(readFileSync(join(NPC_SOURCE_DIR, 'aventureira', `${sheet}.png`)));
    expect([built.width, built.height]).toEqual([site.width, site.height]);
    expect(differentPixels(built, site)).toBe(0);
  });

  it('credits.csv is the same', () => {
    const site = readFileSync(join(SITE_EXPORT, 'credits.csv'), 'utf8');
    expect(readFileSync(join(NPC_SOURCE_DIR, 'aventureira', 'credits.csv'), 'utf8')).toBe(site);
  });
});

describe.each(builtSprites)('%s', (name) => {
  it('has a recipe the generator format accepts', () => {
    expect(() => parseRecipe(readFileSync(recipeFile(name), 'utf8'))).not.toThrow();
  });

  it('credits every layer with authors and licenses', () => {
    const csv = readFileSync(join(NPC_SOURCE_DIR, name, 'credits.csv'), 'utf8');
    expect(csv.split('\n').length).toBeGreaterThan(1);
    expect(incompleteCreditRows(csv)).toEqual([]);
  });
});
