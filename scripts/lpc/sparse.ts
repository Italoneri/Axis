import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GENERATOR_DIR } from './paths';

const SPARSE_FILE = join(GENERATOR_DIR, '.git', 'info', 'sparse-checkout');

/** Everything but the art; spritesheet folders are added per recipe. */
export const BASE_SPARSE_PATTERNS: readonly string[] = [
  '/*',
  '!/spritesheets/',
  '!/readme-images/',
];

export function readSparsePatterns(): string[] {
  if (!existsSync(SPARSE_FILE)) return [];
  return readFileSync(SPARSE_FILE, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
}

export function writeSparsePatterns(patterns: readonly string[]): void {
  writeFileSync(SPARSE_FILE, `${[...new Set(patterns)].join('\n')}\n`);
}

/** Pattern that checks out one spritesheets/ folder. */
export function spritesheetPattern(folder: string): string {
  return `/spritesheets/${folder.replace(/^\/+|\/+$/g, '')}/`;
}
