import { describe, expect, it } from 'vitest';
import { findBuilding } from '../model/catalog';
import type { GameState } from '../model/schema';
import { makeState, testCatalog } from '../systems/testFixtures';
import { levelFacts, shortcutModel } from './buildingDetails';
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

describe('shortcutModel', () => {
  const thorin = { role: 'player', characterId: 'thorin' } as const;
  const master = { role: 'master' } as const;
  const forgeLevel2 = { coins: 400, materials: { wood: 108, iron: 72, aetherium: 10 } };
  const quantities: Record<string, number> = { wood: 96, iron: 72, aetherium: 8 };

  function stateWith(tradingPostLevel: number, shopHidden: readonly string[] = []): GameState {
    const base = makeState({
      slots:
        tradingPostLevel > 0
          ? { s1: { buildingId: 'trading_post', level: tradingPostLevel, status: 'done' } }
          : {},
    });
    return {
      ...base,
      materials: {
        ...base.materials,
        items: base.materials.items.map((m) => ({ ...m, quantity: quantities[m.id] ?? 0 })),
      },
      shop: { items: base.shop.items.map((i) => ({ ...i, hidden: shopHidden.includes(i.id) })) },
    };
  }

  it('buildsShortcutForForgeLevel2', () => {
    expect(shortcutModel(stateWith(1), testCatalog, forgeLevel2, thorin)).toEqual({
      label: 'Comprar o que falta no Entreposto — 1 Ouro, 3 Prata e 6 Bronze',
      lines: ['12 Madeira — 3 Prata e 6 Bronze', '2 Aetherium — 1 Ouro'],
      unavailable: [],
    });
  });

  it('namesMaterialsTheShopDoesNotSell', () => {
    const model = shortcutModel(stateWith(1, ['shop_aetherium']), testCatalog, forgeLevel2, thorin);
    expect(model?.unavailable).toEqual(['Aetherium']);
    expect(model?.lines).toEqual(['12 Madeira — 3 Prata e 6 Bronze']);
  });

  it('hidesShortcutWithoutTradingPost', () => {
    expect(shortcutModel(stateWith(0), testCatalog, forgeLevel2, thorin)).toBeNull();
  });

  it('hidesShortcutWhenNothingIsBuyable', () => {
    const state = stateWith(1, ['shop_wood']);
    expect(
      shortcutModel(state, testCatalog, { coins: 0, materials: { wood: 100 } }, thorin),
    ).toBeNull();
  });

  it('readsFreeForMaster', () => {
    const model = shortcutModel(stateWith(1), testCatalog, forgeLevel2, master);
    expect(model?.label).toBe('Comprar o que falta no Entreposto — de graça');
    expect(model?.lines).toEqual(['12 Madeira — de graça', '2 Aetherium — de graça']);
  });
});
