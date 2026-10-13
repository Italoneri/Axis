import { describe, expect, it } from 'vitest';
import assets from '../data/assets.json';
import credits from '../data/credits.json';
import npcSprites from '../data/npc_sprites.json';
import { parseCredits } from '../ui/Credits';
import {
  facingFor,
  sheetKeys,
  isMissingSprite,
  spriteFor,
  spriteLabel,
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

  it('leaves out a sprite named like "not on the map"', () => {
    expect(spriteNames(manifest(['npc.none.walk', 'npc.ana.walk']))).toEqual(['ana']);
  });
});

describe('spriteLabel', () => {
  it.each([
    ['aventureira', 'Aventureira'],
    ['aventureira_civil', 'Aventureira (civil)'],
    ['guarda_da-noite', 'Guarda (da noite)'],
  ])('reads %s as %s', (name, label) => {
    expect(spriteLabel(name)).toBe(label);
  });
});

describe('spriteFor', () => {
  const names = ['ana', 'bia', 'zeca'];
  const automatic = (id: string) => spriteFor({ id }, names, {});

  it('picks the same sprite for the same id every time', () => {
    expect(automatic('npc_42')).toBe(automatic('npc_42'));
  });

  it('spreads ids over every sprite', () => {
    const picked = new Set(Array.from({ length: 60 }, (_, i) => automatic(`npc_${i}`)));
    expect(picked).toEqual(new Set(names));
  });

  it.each([
    { name: 'the choice over the pin', sprite: 'zeca', pin: 'bia', expected: 'zeca' },
    { name: 'the pin without a choice', sprite: undefined, pin: 'bia', expected: 'bia' },
    { name: 'the pin over a choice that is gone', sprite: 'gone', pin: 'bia', expected: 'bia' },
  ])('prefers $name', ({ sprite, pin, expected }) => {
    const npc = sprite === undefined ? { id: 'npc_1' } : { id: 'npc_1', sprite };
    expect(spriteFor(npc, names, { npc_1: pin })).toBe(expected);
  });

  it('falls back to the automatic pick when the choice and the pin are gone', () => {
    expect(spriteFor({ id: 'npc_1', sprite: 'gone' }, names, { npc_1: 'lost' })).toBe(
      automatic('npc_1'),
    );
  });

  it('keeps an NPC hidden from the map off it, even with a pin', () => {
    expect(spriteFor({ id: 'npc_1', sprite: 'none' }, names, { npc_1: 'bia' })).toBeUndefined();
  });

  it('returns undefined when there is no sprite', () => {
    expect(spriteFor({ id: 'npc_1' }, [], {})).toBeUndefined();
  });
});

describe('isMissingSprite', () => {
  it.each([
    { sprite: undefined, missing: false },
    { sprite: 'none', missing: false },
    { sprite: 'ana', missing: false },
    { sprite: 'gone', missing: true },
  ])('is $missing for $sprite', ({ sprite, missing }) => {
    expect(isMissingSprite(sprite, ['ana'])).toBe(missing);
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
