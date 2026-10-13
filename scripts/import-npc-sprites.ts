/**
 * Copies every character exported by the Universal LPC Spritesheet Generator
 * from art-sources/npcs/<name>/ to public/assets/npcs/<name>/, registers its
 * sheets in assets.json (`npc.<name>.walk`, `npc.<name>.idle`) and writes its
 * authors and licenses (from credits.csv) to credits.json. A new folder joins
 * the walking NPCs after running this again; no code changes.
 *
 *   npm run import:npcs
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SOURCE_DIR = join(ROOT, 'art-sources/npcs');
const PUBLIC_DIR = join(ROOT, 'public/assets/npcs');
const ASSETS_FILE = join(ROOT, 'src/data/assets.json');
const CREDITS_FILE = join(ROOT, 'src/data/credits.json');
const SPRITE_NAME = /^[\w-]+$/;
const SHEETS = ['walk', 'idle'] as const;
const GENERATOR_URL =
  'https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/';

interface SpriteLayer {
  part: string;
  notes: string;
  authors: string[];
  licenses: string[];
  urls: string[];
}

interface SpriteCredit {
  id: string;
  work: string;
  source: string;
  url: string;
  usedFor: string;
  layers: SpriteLayer[];
}

function spriteNames(): string[] {
  return readdirSync(SOURCE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SPRITE_NAME.test(entry.name))
    .filter((entry) => existsSync(join(SOURCE_DIR, entry.name, 'walk.png')))
    .map((entry) => entry.name)
    .sort();
}

/** Copies the sheets the game uses and returns their asset keys and public paths. */
function copySheets(name: string): [string, string][] {
  mkdirSync(join(PUBLIC_DIR, name), { recursive: true });
  return SHEETS.flatMap((sheet) => {
    const from = join(SOURCE_DIR, name, `${sheet}.png`);
    if (!existsSync(from)) return [];
    copyFileSync(from, join(PUBLIC_DIR, name, `${sheet}.png`));
    return [[`npc.${name}.${sheet}`, `assets/npcs/${name}/${sheet}.png`]];
  });
}

function spriteCredit(name: string): SpriteCredit {
  const csv = join(SOURCE_DIR, name, 'credits.csv');
  if (!existsSync(csv)) throw new Error(`${name}: credits.csv is required (LPC licenses)`);
  const [header, ...rows] = parseCsv(readFileSync(csv, 'utf8'));
  const column = (row: string[], title: string) => row[header?.indexOf(title) ?? -1] ?? '';
  return {
    id: name,
    work: `Personagem "${name}" (Universal LPC Spritesheet)`,
    source: 'Universal LPC Spritesheet Character Generator',
    url: GENERATOR_URL,
    usedFor: 'NPCs andando no mapa',
    layers: rows.map((row) => ({
      part: column(row, 'filename'),
      notes: column(row, 'notes'),
      authors: splitList(column(row, 'authors')),
      licenses: splitList(column(row, 'licenses')),
      urls: splitList(column(row, 'urls')),
    })),
  };
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** RFC 4180 subset: quoted fields may hold commas, doubled quotes and line breaks. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function readJson(file: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) throw new Error(`${file}: not an object`);
  return { ...parsed };
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function main(): void {
  const names = spriteNames();
  const assets = readJson(ASSETS_FILE);
  const registered =
    typeof assets.images === 'object' && assets.images !== null ? assets.images : {};
  const images = Object.entries(registered).filter(([key]) => !key.startsWith('npc.'));
  const sheets = names.flatMap(copySheets);
  writeJson(ASSETS_FILE, { ...assets, images: Object.fromEntries([...images, ...sheets]) });

  const credits = readJson(CREDITS_FILE);
  writeJson(CREDITS_FILE, { ...credits, sprites: names.map(spriteCredit) });
  console.info(`[npcs] ${names.length} sprite(s): ${names.join(', ') || '(none)'}`);
}

main();
