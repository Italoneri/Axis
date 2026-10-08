import { describe, expect, it } from 'vitest';
import { gameData } from '../data/gameData';
import assets from '../data/assets.json';
import buildings from '../data/buildings.json';
import resources from '../data/resources.json';
import slots from '../data/slots.json';
import { parseCatalog } from './catalog';

describe('shipped game data', () => {
  // Guards hand edits to src/data/*.json: `npm test` points at the broken entry.
  it('is valid and cross-referenced', () => {
    expect(gameData.buildings.length).toBeGreaterThan(0);
  });

  it('has exactly one structure for the core slot', () => {
    expect(gameData.buildings.filter((b) => b.allowedSlots.includes('core'))).toHaveLength(1);
  });
});

describe('parseCatalog', () => {
  it('lists broken references', () => {
    const brokenBuildings = [
      { ...buildings[0], requires: [{ building: 'ghost', minLevel: 1 }], sprite: 'missing.sprite' },
    ];
    expect(() => parseCatalog({ resources, buildings: brokenBuildings, slots, assets })).toThrow(
      /requires unknown building "ghost"[\s\S]*asset "missing.sprite"|asset "missing.sprite"[\s\S]*unknown building "ghost"/,
    );
  });

  it('rejects an invalid slot type', () => {
    const brokenSlots = { ...slots, slots: [{ id: 'x', type: 'roof', x: 0.5, y: 0.5 }] };
    expect(() => parseCatalog({ resources, buildings, slots: brokenSlots, assets })).toThrow(
      /slots.json/,
    );
  });
});
