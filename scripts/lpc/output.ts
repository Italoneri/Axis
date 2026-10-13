import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { samePixels } from './png';

export interface Output {
  readonly file: string;
  readonly content: Uint8Array;
  /** Images compare by pixels: two PNG encoders may store the same picture differently. */
  readonly kind: 'image' | 'text';
}

const SAME: Record<Output['kind'], (a: Uint8Array, b: Uint8Array) => boolean> = {
  image: samePixels,
  text: (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0,
};

const VOLATILE_METADATA = ['exportTimestamp', 'performance'];

/** Writes the output unless the file already holds the same content; true when written. */
export function writeIfChanged(folder: string, output: Output): boolean {
  const file = join(folder, output.file);
  if (existsSync(file) && SAME[output.kind](readFileSync(file), output.content)) return false;
  writeFileSync(file, output.content);
  return true;
}

/** The site's metadata minus the export time and timings, so rebuilding changes nothing. */
export function stableMetadata(json: string): Uint8Array {
  const parsed = z.looseObject({}).parse(JSON.parse(json));
  const stable = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => !VOLATILE_METADATA.includes(key)),
  );
  return new TextEncoder().encode(`${JSON.stringify(stable, null, 2)}\n`);
}
