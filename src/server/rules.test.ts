import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { buildFunctionBundle } from '../../scripts/build-functions';
import { gameData } from '../data/gameData';
import type { Catalog } from '../model/catalog';
import { serverCatalog } from './catalog';
import type * as Rules from './rules';
import { paritySample } from './rules';

describe('server catalog', () => {
  it('holds the same rules data as the game', () => {
    // Only `assets` differs: the game adds the building art, which the rules never read.
    const rulesData = ({ currencies, buildings, layout, worlds, seed }: Catalog) => ({
      currencies,
      buildings,
      layout,
      worlds,
      seed,
    });
    expect(rulesData(serverCatalog)).toEqual(rulesData(gameData));
  });
});

describe('Edge Function bundle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'axis-bundle-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('reaches the same state as the source code', async () => {
    const outfile = join(dir, 'game.js');
    await buildFunctionBundle(outfile);
    const bundle: typeof Rules = await import(pathToFileURL(outfile).href);
    expect(bundle.paritySample()).toBe(paritySample());
  }, 30_000);
});
