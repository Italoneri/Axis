/**
 * Clones (or updates) the Universal LPC Spritesheet Character Generator into
 * vendor/lpc-generator, outside the game's git, and checks it can run.
 *
 * The clone is shallow and blobless with a sparse checkout: definitions, code and
 * palettes come down now; spritesheets come down per recipe, on `npm run lpc:build`.
 *
 *   npm run lpc:setup
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { git, npm } from './commands';
import { applyDefinitionFixes } from './definitionFixes';
import { GENERATOR_DIR, GENERATOR_REPO } from './paths';
import { BASE_SPARSE_PATTERNS, readSparsePatterns, writeSparsePatterns } from './sparse';

const BRANCH = 'master';
const LOCK_STAMP = join(GENERATOR_DIR, 'node_modules', '.lpc-setup-lock');
const REQUIRED_PATHS = [
  'sheet_definitions',
  'palette_definitions',
  'sources/state/zip.ts',
  'scripts/generateSources/items.ts',
  'node_modules/vite/bin/vite.js',
];

function cloneOrUpdate(): void {
  if (!existsSync(join(GENERATOR_DIR, '.git'))) {
    console.info(`[lpc] cloning ${GENERATOR_REPO}`);
    git([
      'clone',
      '--depth',
      '1',
      '--filter=blob:none',
      '--no-checkout',
      GENERATOR_REPO,
      GENERATOR_DIR,
    ]);
    git(['sparse-checkout', 'init', '--no-cone']);
  }
  console.info('[lpc] fetching the latest generator');
  git(['fetch', '--depth', '1', 'origin', BRANCH]);
  // Running the generator rewrites a few of its own tracked files; the upstream copy wins.
  git(['reset', '--hard', 'FETCH_HEAD']);
  const kept = readSparsePatterns().filter((pattern) => !BASE_SPARSE_PATTERNS.includes(pattern));
  writeSparsePatterns([...BASE_SPARSE_PATTERNS, ...kept]);
  git(['sparse-checkout', 'reapply']);
  applyDefinitionFixes();
}

/** `npm ci` only when the lockfile changed since the last setup. */
function installDependencies(): void {
  const lock = readFileSync(join(GENERATOR_DIR, 'package-lock.json'), 'utf8');
  const installed = existsSync(LOCK_STAMP) ? readFileSync(LOCK_STAMP, 'utf8') : '';
  if (installed === lock) return;
  console.info('[lpc] installing the generator dependencies (npm ci)');
  npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], GENERATOR_DIR);
  writeFileSync(LOCK_STAMP, lock);
}

async function verify(): Promise<void> {
  const missing = REQUIRED_PATHS.filter((path) => !existsSync(join(GENERATOR_DIR, path)));
  if (missing.length > 0)
    throw new Error(`generator is incomplete, missing: ${missing.join(', ')}`);
  const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch((error) => {
    throw new Error(`lpc:build drives Google Chrome, which did not start: ${String(error)}`);
  });
  await browser.close();
}

function sizeOf(path: string): number {
  if (!existsSync(path)) return 0;
  return readdirSync(path, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .reduce((total, entry) => total + statSync(join(entry.parentPath, entry.name)).size, 0);
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function reportSize(): void {
  const total = sizeOf(GENERATOR_DIR);
  const modules = sizeOf(join(GENERATOR_DIR, 'node_modules'));
  const sheets = sizeOf(join(GENERATOR_DIR, 'spritesheets'));
  console.info(
    `[lpc] ready in vendor/lpc-generator: ${megabytes(total)} ` +
      `(node_modules ${megabytes(modules)}, spritesheets ${megabytes(sheets)}, ` +
      `git + code + definitions ${megabytes(total - modules - sheets)})`,
  );
}

async function main(): Promise<void> {
  cloneOrUpdate();
  installDependencies();
  await verify();
  reportSize();
}

try {
  await main();
} catch (error) {
  console.error(`[lpc] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
