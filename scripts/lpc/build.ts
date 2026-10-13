/**
 * Builds NPC sprites from their recipes (art-sources/npcs/<name>/character.json)
 * with the generator cloned by lpc:setup, writing what the site's "ZIP: Split by
 * animation" gives: one PNG per animation plus credits.csv, credits.txt and
 * metadata.json. Unchanged files are left alone. Then runs import:npcs.
 *
 *   npm run lpc:build -- <name> [<name>…]
 *   npm run lpc:build -- --all
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { loadCatalog, type Catalog } from './catalog';
import { git, npm } from './commands';
import { parseExportedCharacter, uncreditedLayers } from './credits';
import { openGeneratorSite, type GeneratorSite } from './generatorSite';
import { NPC_SOURCE_DIR, recipeFile, ROOT } from './paths';
import { stableMetadata, writeIfChanged, type Output } from './output';
import { walkPreview } from './preview';
import {
  parseRecipe,
  recipeProblems,
  selectedItemIds,
  spritesheetFolders,
  type Recipe,
} from './recipe';
import { readSparsePatterns, spritesheetPattern, writeSparsePatterns } from './sparse';

const SPRITE_NAME = /^[\w-]+$/;
/** The game uses walk and idle; the rest wait in art-sources until it does. */
const KEPT_ANIMATIONS = [
  'walk',
  'idle',
  'run',
  'sit',
  'hurt',
  'slash',
  'thrust',
  'spellcast',
  'watering',
  'emote',
] as const;
const CREDIT_FILES = ['credits.csv', 'credits.txt'] as const;
const IMPORTED_DATA = ['src/data/assets.json', 'src/data/credits.json'];

interface Sprite {
  name: string;
  json: string;
  recipe: Recipe;
}

function requestedNames(args: readonly string[]): string[] {
  if (args.includes('--all')) {
    return readdirSync(NPC_SOURCE_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(recipeFile(entry.name)))
      .map((entry) => entry.name)
      .sort();
  }
  if (args.length === 0) throw new Error('usage: npm run lpc:build -- <name>… | --all');
  return [...args];
}

function readSprite(name: string, catalog: Catalog): Sprite {
  if (!SPRITE_NAME.test(name)) throw new Error(`${name}: use letters, digits, _ or -`);
  const file = recipeFile(name);
  if (!existsSync(file)) throw new Error(`${name}: no recipe at ${file}`);
  const json = readFileSync(file, 'utf8');
  const recipe = parseRecipe(json);
  const problems = recipeProblems(recipe, catalog);
  if (problems.length > 0) {
    throw new Error(`${name}: invalid recipe\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
  return { name, json, recipe };
}

/** Brings down only the spritesheet folders these recipes draw from. */
function checkOutSpritesheets(sprites: readonly Sprite[], catalog: Catalog): void {
  const current = readSparsePatterns();
  const needed = sprites
    .flatMap((sprite) => spritesheetFolders(sprite.recipe, catalog))
    .map(spritesheetPattern)
    .filter((pattern) => !current.includes(pattern));
  if (needed.length === 0) return;
  console.info(`[lpc] fetching ${needed.length} spritesheet folder(s)`);
  writeSparsePatterns([...current, ...needed]);
  git(['sparse-checkout', 'reapply']);
}

function zipEntry(files: Record<string, Uint8Array>, path: string): Uint8Array {
  const content = files[path];
  if (content === undefined) throw new Error(`generator ZIP has no ${path}`);
  return content;
}

async function buildSprite(site: GeneratorSite, sprite: Sprite): Promise<string[]> {
  const zip = unzipSync(
    await site.exportSplitAnimations(sprite.json, selectedItemIds(sprite.recipe)),
  );
  const text = (path: string) => new TextDecoder().decode(zipEntry(zip, path));
  const uncredited = uncreditedLayers(parseExportedCharacter(text('character.json')));
  if (uncredited.length > 0) {
    throw new Error(`${sprite.name}: layers without authors/licenses: ${uncredited.join(', ')}`);
  }
  const outputs: Output[] = [
    ...KEPT_ANIMATIONS.map((animation) => ({
      file: `${animation}.png`,
      content: zipEntry(zip, `standard/${animation}.png`),
      kind: 'image' as const,
    })),
    ...CREDIT_FILES.map((file) => ({
      file,
      content: zipEntry(zip, `credits/${file}`),
      kind: 'text' as const,
    })),
    { file: 'metadata.json', content: stableMetadata(text('credits/metadata.json')), kind: 'text' },
    {
      file: 'preview.png',
      content: await walkPreview(zipEntry(zip, 'standard/walk.png')),
      kind: 'image',
    },
  ];
  const folder = join(NPC_SOURCE_DIR, sprite.name);
  return outputs.filter((output) => writeIfChanged(folder, output)).map(({ file }) => file);
}

async function main(): Promise<void> {
  const catalog = await loadCatalog();
  const sprites = requestedNames(process.argv.slice(2)).map((name) => readSprite(name, catalog));
  checkOutSpritesheets(sprites, catalog);
  const site = await openGeneratorSite();
  try {
    for (const sprite of sprites) {
      const changed = await buildSprite(site, sprite);
      console.info(
        `[lpc] ${sprite.name}: ${changed.length > 0 ? changed.join(', ') : 'unchanged'}`,
      );
    }
  } finally {
    await site.close();
  }
  npm(['run', 'import:npcs'], ROOT);
  // import:npcs writes plain JSON.stringify; the repo keeps these files Prettier-formatted.
  npm(['exec', '--', 'prettier', '--log-level', 'warn', '--write', ...IMPORTED_DATA], ROOT);
}

try {
  await main();
} catch (error) {
  console.error(`[lpc] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
