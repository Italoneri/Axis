import { describe, expect, it } from 'vitest';
import assets from '../data/assets.json';
import credits from '../data/credits.json';
import npcSprites from '../data/npc_sprites.json';
import { parseCredits } from '../ui/Credits';
import {
  facingFor,
  sheetKeys,
  spriteFor,
  spriteNames,
  spriteOverridesSchema,
  usedColumns,
} from './npcSprites';

const manifest = (keys: string[]) => ({
  images: Object.fromEntries(keys.map((key) => [key, `assets/${key}.png`])),
});

describe('spriteNames', () => {
  it('lists each sprite with a walk sheet once, sorted', () => {
    const names = spriteNames(
      manifest(['npc.zeca.walk', 'npc.zeca.idle', 'npc.ana.walk', 'npc.solo.idle', 'icon.gold']),
    );
    expect(names).toEqual(['ana', 'zeca']);
  });
});

describe('spriteFor', () => {
  const names = ['ana', 'bia', 'zeca'];

  it('picks the same sprite for the same id every time', () => {
    expect(spriteFor('npc_42', names, {})).toBe(spriteFor('npc_42', names, {}));
  });

  it('spreads ids over every sprite', () => {
    const picked = new Set(Array.from({ length: 60 }, (_, i) => spriteFor(`npc_${i}`, names, {})));
    expect(picked).toEqual(new Set(names));
  });

  it('honors a pinned sprite that exists and ignores one that does not', () => {
    expect(spriteFor('npc_1', names, { npc_1: 'bia' })).toBe('bia');
    expect(spriteFor('npc_1', names, { npc_1: 'gone' })).toBe(spriteFor('npc_1', names, {}));
  });

  it('returns undefined when there is no sprite', () => {
    expect(spriteFor('npc_1', [], {})).toBeUndefined();
  });
});

describe('usedColumns', () => {
  it('counts up to the last drawn column of any row', () => {
    const drawn = new Set(['0/0', '8/2', '3/3']);
    expect(usedColumns(13, 4, (c, r) => drawn.has(`${c}/${r}`))).toBe(9);
  });

  it('is 0 for an empty sheet', () => {
    expect(usedColumns(13, 4, () => false)).toBe(0);
  });
});

describe('facingFor', () => {
  it.each([
    [1, 0, 'east'],
    [-1, 0.2, 'west'],
    [0.1, 1, 'south'],
    [0, -1, 'north'],
    [1, 1, 'south'],
  ] as const)('(%d, %d) faces %s', (dx, dy, facing) => {
    expect(facingFor(dx, dy)).toBe(facing);
  });
});

describe('registered sprites', () => {
  const names = spriteNames(assets);

  it('has at least one sprite', () => {
    expect(names.length).toBeGreaterThan(0);
  });

  it('credits every registered sprite (LPC licenses require attribution)', () => {
    const credited = new Map(parseCredits(credits).sprites.map((c) => [c.id, c]));
    names.forEach((name) => {
      const credit = credited.get(name);
      expect(credit, name).toBeDefined();
      credit?.layers.forEach((layer) => {
        expect(layer.authors.length, `${name} ${layer.part}`).toBeGreaterThan(0);
        expect(layer.licenses.length, `${name} ${layer.part}`).toBeGreaterThan(0);
      });
    });
  });

  it('registers a walk sheet for every sprite and pins only known sprites', () => {
    names.forEach((name) => expect(assets.images).toHaveProperty([sheetKeys(name).walk]));
    const pinned = Object.values(spriteOverridesSchema.parse(npcSprites));
    pinned.forEach((name) => expect(names).toContain(name));
  });
});
