import { describe, expect, it } from 'vitest';
import { gameData, rawGameData } from '../data/gameData';
import { parseCatalog } from './catalog';

describe('shipped game data', () => {
  // Guards hand edits to src/data/*.json: `npm test` points at the broken entry.
  it('is valid and cross-referenced', () => {
    expect(gameData.buildings.length).toBeGreaterThan(0);
  });

  it('has exactly one structure for the core slot', () => {
    expect(gameData.buildings.filter((b) => b.allowedSlots.includes('core'))).toHaveLength(1);
  });

  it('only charges materials that exist in the seed', () => {
    const seeded = new Set(gameData.seed.materials.items.map((m) => m.id));
    const used = gameData.buildings.flatMap((b) =>
      b.levels.flatMap((l) => Object.keys(l.cost.materials ?? {})),
    );
    expect(used.filter((id) => !seeded.has(id))).toEqual([]);
  });

  it('keeps the shipped layout: 23 slots, no inner ring, ids not renumbered', () => {
    const ids = gameData.layout.slots.map((s) => s.id);
    expect(ids).toHaveLength(23);
    expect(gameData.layout.slots.filter((s) => s.type === 'outer')).toHaveLength(14);
    expect(ids).toContain('outer_13');
    expect(ids).not.toContain('outer_11');
  });

  it('places one prism per entrance, Roxo at North', () => {
    const { angles, prisms } = gameData.layout.entrances;
    expect(prisms).toHaveLength(angles.length);
    expect(prisms[0]?.id).toBe('roxo');
  });

  it('lists currencies from the most to the least valuable', () => {
    const values = gameData.currencies.map((c) => c.bronzeValue);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});

describe('parseCatalog', () => {
  it('lists broken references', () => {
    const [first] = rawGameData.buildings;
    const buildings = [
      { ...first, requires: [{ building: 'ghost', minLevel: 1 }], sprite: 'missing.sprite' },
    ];
    expect(() => parseCatalog({ ...rawGameData, buildings })).toThrow(
      /requires unknown building "ghost"[\s\S]*asset "missing.sprite"|asset "missing.sprite"[\s\S]*unknown building "ghost"/,
    );
  });

  it('rejects an invalid slot type', () => {
    const slots = [{ id: 'x', type: 'roof', shape: 'round', x: 0.5, y: 0.5, angle: 0, size: 0.1 }];
    const layout = { ...rawGameData.layout, slots };
    expect(() => parseCatalog({ ...rawGameData, layout })).toThrow(/layout.json/);
  });

  it('rejects a slot on the reserved stretch of the wall', () => {
    // outer_1 spans 4.74° → 21.78°.
    const reserved = [{ id: 'secret', startAngle: 0, endAngle: 30 }];
    const layout = { ...rawGameData.layout, reserved };
    expect(() => parseCatalog({ ...rawGameData, layout })).toThrow(/overlaps a reserved stretch/);
  });

  it('rejects structures allowed only on slot types missing from the layout', () => {
    const slots = rawGameData.layout.slots.filter((s) => s.type !== 'middle');
    const layout = { ...rawGameData.layout, slots };
    expect(() => parseCatalog({ ...rawGameData, layout })).toThrow(/allowedSlots "middle"/);
  });

  it('requires a gold currency and a coin worth one bronze', () => {
    const currencies = rawGameData.currencies.filter((c) => c.bronzeValue >= 1000);
    expect(() => parseCatalog({ ...rawGameData, currencies })).toThrow(
      /id "gold" is required[\s\S]*bronzeValue 1/,
    );
  });

  it('rejects seeded materials in unknown categories', () => {
    const materials = {
      ...rawGameData.materials,
      items: [{ id: 'x', name: 'X', category: 'nowhere', quantity: 1 }],
    };
    expect(() => parseCatalog({ ...rawGameData, materials })).toThrow(/unknown category "nowhere"/);
  });
});
