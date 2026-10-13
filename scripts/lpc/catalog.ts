/**
 * The generator's item catalog, read by the generator's own metadata code
 * (scripts/generateSources) so ids, variants and recolor names match the site.
 */
import { Dirent, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { GENERATOR_DIR } from './paths';

export interface CatalogRecolor {
  /** Selection key of a sub-selection; null means the item's own key. */
  readonly typeName: string | null;
  readonly label: string;
  readonly colors: readonly string[];
}

export interface CatalogItem {
  readonly id: string;
  readonly name: string;
  /** Selection key in character.json (`selections.<typeName>`). */
  readonly typeName: string;
  readonly category: readonly string[];
  readonly bodyTypes: readonly string[];
  readonly animations: readonly string[];
  readonly variants: readonly string[];
  readonly recolors: readonly CatalogRecolor[];
  /** Spritesheet folder per body type, one map per layer; may hold `${…}` placeholders. */
  readonly layers: readonly Readonly<Record<string, string>>[];
}

export interface Catalog {
  readonly bodyTypes: readonly string[];
  readonly items: ReadonlyMap<string, CatalogItem>;
}

const generatorItemSchema = z.object({
  name: z.string(),
  type_name: z.string(),
  path: z.array(z.string()),
  required: z.array(z.string()),
  animations: z.array(z.string()),
  variants: z.array(z.string()),
  recolors: z.array(
    z.object({
      type_name: z.string().nullable(),
      label: z.string(),
      variants: z.array(z.string()),
    }),
  ),
  layers: z.record(z.string(), z.record(z.string(), z.unknown())),
});
type GeneratorItem = z.infer<typeof generatorItemSchema>;

const stateModuleSchema = z.object({ itemMetadata: z.record(z.string(), z.unknown()) });
const constantsModuleSchema = z.object({ BODY_TYPES: z.array(z.string()) });
type GeneratorFunction = (...args: unknown[]) => unknown;

export function assertGeneratorReady(): void {
  if (!existsSync(join(GENERATOR_DIR, 'node_modules', 'vite'))) {
    throw new Error('the LPC generator is not set up: run npm run lpc:setup');
  }
}

async function importGenerator(relativePath: string): Promise<Record<string, unknown>> {
  return import(pathToFileURL(join(GENERATOR_DIR, relativePath)).href);
}

function exported(module: Record<string, unknown>, name: string): GeneratorFunction {
  const value = module[name];
  if (typeof value !== 'function') throw new Error(`generator no longer exports ${name}()`);
  return (...args) => Reflect.apply(value, module, args);
}

function isDirents(value: unknown): value is Dirent[] {
  return Array.isArray(value) && value.every((entry) => entry instanceof Dirent);
}

/** Runs the generator's metadata parsing; it resolves its folders against the working directory. */
async function parseGeneratorItems(): Promise<Record<string, unknown>> {
  const previousDir = process.cwd();
  process.chdir(GENERATOR_DIR);
  try {
    const state = await importGenerator('scripts/generateSources/state.ts');
    const palettes = await importGenerator('scripts/generateSources/palettes.ts');
    const items = await importGenerator('scripts/generateSources/items.ts');
    const parseItem = exported(items, 'parseItem');
    exported(palettes, 'loadPaletteMetadata')();
    const entries = exported(state, 'readDirTree')(z.string().parse(state.SHEETS_DIR));
    if (!isDirents(entries)) throw new Error('generator readDirTree() changed shape');
    for (const entry of entries) {
      if (entry.isDirectory() || entry.name.startsWith('meta_')) continue;
      parseIgnoringSkipped(() => parseItem(entry.parentPath, entry.name));
    }
    return stateModuleSchema.parse(state).itemMetadata;
  } finally {
    process.chdir(previousDir);
  }
}

/** The generator throws for definitions marked `ignore`; the site skips them the same way. */
function parseIgnoringSkipped(parse: () => unknown): void {
  try {
    parse();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Skipping ignored item')) return;
    throw error;
  }
}

function toCatalogItem(id: string, item: GeneratorItem, bodyTypes: readonly string[]): CatalogItem {
  const layers = Object.keys(item.layers)
    .sort((a, b) => layerNumber(a) - layerNumber(b))
    .map((key) => layerFolders(item.layers[key] ?? {}, bodyTypes));
  return {
    id,
    name: item.name,
    typeName: item.type_name,
    category: item.path.slice(0, -1),
    bodyTypes: item.required,
    animations: item.animations,
    variants: item.variants,
    recolors: item.recolors.map((recolor) => ({
      typeName: recolor.type_name,
      label: recolor.label,
      colors: recolor.variants,
    })),
    layers,
  };
}

function layerNumber(key: string): number {
  return Number(key.replace('layer_', ''));
}

function layerFolders(
  layer: Record<string, unknown>,
  bodyTypes: readonly string[],
): Record<string, string> {
  const entries = Object.entries(layer).filter(
    (entry): entry is [string, string] =>
      bodyTypes.includes(entry[0]) && typeof entry[1] === 'string',
  );
  return Object.fromEntries(entries);
}

export async function loadCatalog(): Promise<Catalog> {
  assertGeneratorReady();
  const { BODY_TYPES } = constantsModuleSchema.parse(
    await importGenerator('sources/state/constants.ts'),
  );
  const raw = await parseGeneratorItems();
  const items = new Map(
    Object.entries(raw).map(([id, value]) => [
      id,
      toCatalogItem(id, generatorItemSchema.parse(value), BODY_TYPES),
    ]),
  );
  return { bodyTypes: BODY_TYPES, items };
}
