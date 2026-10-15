import { describe, expect, it } from 'vitest';
import { findBuilding } from '../model/catalog';
import { makeState, testCatalog } from '../systems/testFixtures';
import { levelFacts } from './buildingDetails';
import { textContext } from './format';

const ctx = textContext(testCatalog, makeState());
const forgeYield = (amount: string) =>
  `Posto Forjar: +${amount} Ferro por dia (base, cresce com a perícia do NPC)`;

function facts(buildingId: string, levelIndex: number): string[] {
  const def = findBuilding(testCatalog, buildingId);
  if (!def) throw new Error(`no ${buildingId} in testCatalog`);
  return levelFacts(def, levelIndex, ctx);
}

describe('levelFacts', () => {
  it.each([
    { building: 'forge', index: 0, lines: [forgeYield('1,0')] },
    { building: 'forge', index: 1, lines: ['Requer Coração nv. 1', forgeYield('2,0')] },
    { building: 'armory', index: 0, lines: ['Requer Forja nv. 1'] },
    { building: 'heart', index: 1, lines: ['Posto Rezar: bênção'] },
    { building: 'barracks', index: 1, lines: ['Moradia para 3 NPCs'] },
    { building: 'guild', index: 0, lines: [] },
    { building: 'guild', index: 5, lines: [] },
  ])('lists $building level $index as $lines', ({ building, index, lines }) => {
    expect(facts(building, index)).toEqual(lines);
  });

  it('shows the building-wide requirement on level 1 only', () => {
    const def = findBuilding(testCatalog, 'armory');
    if (!def) throw new Error('no armory in testCatalog');
    const twoLevels = { ...def, levels: [...def.levels, ...def.levels] };
    expect(levelFacts(twoLevels, 1, ctx)).toEqual([]);
  });
});
