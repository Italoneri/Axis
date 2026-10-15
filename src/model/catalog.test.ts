import { describe, expect, it } from 'vitest';
import { gameData, rawGameData } from '../data/gameData';
import { parseCatalog, type RawCatalog } from './catalog';

describe('shipped game data', () => {
  // Guards hand edits to src/data/*.json: `npm test` points at the broken entry.
  it('is valid and cross-referenced', () => {
    expect(gameData.buildings.length).toBeGreaterThan(0);
  });

  it('uses layout v4, with the middle ring drawn as arcs', () => {
    const middle = gameData.layout.slots.filter((s) => s.type === 'middle');
    expect(gameData.layout.version).toBe(4);
    expect(middle).toHaveLength(8);
    expect(middle.every((s) => s.shape === 'arc')).toBe(true);
  });

  it('still reads a v3 layout with square middle slots', () => {
    const square = {
      id: 'mid_1',
      type: 'middle',
      shape: 'square',
      x: 0.5,
      y: 0.252,
      angle: 0,
      size: 0.054,
    };
    const slots = [...rawGameData.layout.slots.filter((s) => s.type !== 'middle'), square];
    const layout = { ...rawGameData.layout, version: 3, slots };
    expect(parseCatalog({ ...rawGameData, layout }).layout.slots).toContainEqual(square);
  });

  it('rejects a middle slot with an unknown shape', () => {
    const odd = { id: 'mid_1', type: 'middle', shape: 'hexagon', x: 0.5, y: 0.25, angle: 0 };
    const layout = { ...rawGameData.layout, slots: [...rawGameData.layout.slots, odd] };
    expect(() => parseCatalog({ ...rawGameData, layout })).toThrow(/layout\.json/);
  });

  it('rejects a building level without its party and axis texts', () => {
    const [first, ...rest] = rawGameData.buildings;
    const level = first?.levels[0];
    if (!first || !level) throw new Error('no buildings shipped');
    const withoutParty = Object.fromEntries(
      Object.entries(level).filter(([key]) => key !== 'party'),
    );
    const broken = { ...first, levels: [withoutParty, ...first.levels.slice(1)] };
    expect(() => parseCatalog({ ...rawGameData, buildings: [broken, ...rest] })).toThrow();
  });

  it('ships every level with party and axis texts, empty meaning "a definir"', () => {
    const levels = gameData.buildings.flatMap((b) => b.levels);
    expect(levels.every((l) => typeof l.party === 'string' && typeof l.axis === 'string')).toBe(
      true,
    );
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

describe('removed buildings', () => {
  it.each(['study_station', 'watchtower'])('leaves no trace of %s in the shipped data', (id) => {
    const catalog = parseCatalog(rawGameData);
    expect(catalog.buildings.map((b) => b.id)).not.toContain(id);
    expect(Object.keys(catalog.assets.images).filter((key) => key.includes(id))).toEqual([]);
    expect(JSON.stringify(rawGameData)).not.toContain(id);
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

  it('rejects posts with unknown skills, repeated activities or the construction activity', () => {
    const post = (activity: string, skill: string) => ({
      activity,
      name: activity,
      skill,
      effect: { type: 'bonus', text: 'x' },
    });
    const buildings = rawGameData.buildings.slice(0, 1).map((building) => ({
      ...building,
      levels: building.levels.map((level) => ({
        ...level,
        jobs: [
          post('a', 'juggling'),
          post('b', 'research'),
          post('b', 'research'),
          post('construir', 'research'),
        ],
      })),
    }));
    expect(() => parseCatalog({ ...rawGameData, buildings })).toThrow(
      /unknown skill "juggling"[\s\S]*duplicate .* post id "b"[\s\S]*"construir" is reserved/,
    );
  });

  it('keeps housing in the buildings npcs.json lists', () => {
    const buildings = rawGameData.buildings.map((building) =>
      building.id === 'tavern'
        ? {
            ...building,
            levels: building.levels.map((level) => ({ ...level, housing: { capacity: 2 } })),
          }
        : building,
    );
    const npcs = { ...rawGameData.npcs, housingBuildings: ['barracks', 'nowhere'] };
    expect(() => parseCatalog({ ...rawGameData, buildings, npcs })).toThrow(
      /unknown building "nowhere"[\s\S]*tavern: housing is only allowed/,
    );
  });

  it.each([
    { name: 'a missing level', table: { 11: 26, 12: 35, 13: 46, 14: 61 } },
    { name: 'an extra level', table: { 11: 26, 12: 35, 13: 46, 14: 61, 15: 80, 16: 99 } },
    { name: 'a level that does not grow', table: { 11: 26, 12: 35, 13: 35, 14: 61, 15: 80 } },
    { name: '11 not above 10 (20 tenths)', table: { 11: 20, 12: 35, 13: 46, 14: 61, 15: 80 } },
  ])('refuses a hero yield table with $name', ({ table }) => {
    const npcs = { ...rawGameData.npcs, skillTenthsAbove10: table };
    expect(() => parseCatalog({ ...rawGameData, npcs })).toThrow(/skillTenthsAbove10/);
  });

  it('refuses an attribute points table that skips a level or stops growing', () => {
    const { attributePointsAbove10: table } = rawGameData.missions;
    const missing = {
      ...rawGameData.missions,
      attributePointsAbove10: { ...table, 20: undefined },
    };
    expect(() => parseCatalog({ ...rawGameData, missions: missing })).toThrow();
    const flat = { ...rawGameData.missions, attributePointsAbove10: { ...table, 12: 13 } };
    expect(() => parseCatalog({ ...rawGameData, missions: flat })).toThrow(
      /attributePointsAbove10 must grow/,
    );
  });

  it('needs post openings for every ring a building with posts accepts, at each level', () => {
    const npcs = { ...rawGameData.npcs, postSlots: { outer: [3, 6] } };
    expect(() => parseCatalog({ ...rawGameData, npcs })).toThrow(
      /postSlots "outer" needs 3 levels[\s\S]*postSlots "middle" needs 3 levels/,
    );
  });

  it('refuses openings written on a post', () => {
    const buildings = rawGameData.buildings.map((building) => ({
      ...building,
      levels: building.levels.map((level) => ({
        ...level,
        jobs: 'jobs' in level ? level.jobs.map((job) => ({ ...job, slots: 1 })) : [],
      })),
    }));
    expect(() => parseCatalog({ ...rawGameData, buildings })).toThrow(/slots/);
  });

  it('ships housing only in the Alojamento', () => {
    const housed = gameData.buildings.filter((b) => b.levels.some((level) => level.housing));
    expect(housed.map((b) => b.id)).toEqual(['barracks']);
  });
});

describe('tavern menu data', () => {
  const items = rawGameData.tavernMenu.items;
  const withItems = (next: unknown[]) => () =>
    parseCatalog({ ...rawGameData, tavernMenu: { items: next } });

  it('ships dishes for every meal', () => {
    const meals = new Set(gameData.tavernMenu.items.map((item) => item.meal));
    expect([...meals].sort()).toEqual(['breakfast', 'dinner', 'lunch']);
  });

  it.each([
    { name: 'an unknown meal', item: { meal: 'supper' }, error: /tavern_menu\.json/ },
    { name: 'a photo missing from assets.json', item: { image: 'menu.nope' }, error: /menu\.nope/ },
    { name: 'an unknown coin', item: { price: { copper: 2 } }, error: /unknown coin "copper"/ },
    { name: 'a level the tavern lacks', item: { minLevel: 9 }, error: /minLevel 9/ },
  ])('rejects a dish with $name', ({ item, error }) => {
    expect(withItems([...items, { ...items[0], id: 'extra', ...item }])).toThrow(error);
  });

  it('rejects a repeated dish id', () => {
    expect(withItems([...items, items[0]])).toThrow(/duplicate menu item id/);
  });

  it('defaults to an empty menu when the file is left out, as on the server', () => {
    const withoutMenu: RawCatalog = { ...rawGameData };
    delete withoutMenu.tavernMenu;
    expect(parseCatalog(withoutMenu).tavernMenu.items).toEqual([]);
  });
});
