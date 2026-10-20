import { describe, expect, it } from 'vitest';
import type { StockRef } from '../model/schema';
import type { Depot, DepotItem } from './Depot';
import {
  depotSnapshot,
  hasLinks,
  itemLinks,
  lostName,
  parseRefKey,
  refExists,
  refKey,
  refName,
  refQuantity,
  sameRef,
  sumMoves,
} from './Stock';
import { withIron } from './testFixtures';

const NOW = '2026-10-19T12:00:00.000Z';

function item(id: string, sectionId: string, extra: Partial<DepotItem> = {}): DepotItem {
  return {
    id,
    sectionId,
    name: id,
    kind: 'outro',
    quantity: 2,
    notes: '',
    order: 0,
    authorId: 'mestre',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...extra,
  };
}

const fullDepot: Depot = {
  sections: [
    {
      id: 'porcoes',
      name: 'Porções',
      ownerId: null,
      order: 0,
      authorId: 'mestre',
      deletedAt: null,
    },
    { id: 'bau', name: 'Baú', ownerId: 'thorin', order: 0, authorId: 'thorin', deletedAt: null },
  ],
  items: [
    item('cavalo', 'porcoes', { name: 'Porção de cavalo', quantity: 2 }),
    item('lixo', 'porcoes', { name: 'Velha', deletedAt: NOW }),
    item('secreto', 'bau', { name: 'Segredo' }),
  ],
};

const iron: StockRef = { source: 'material', materialId: 'iron' };
const cavalo: StockRef = { source: 'depot', itemId: 'cavalo' };
const state = withIron(5);
const depot = depotSnapshot(fullDepot);

describe('stock refs', () => {
  it('compares source and id', () => {
    expect(sameRef(iron, { source: 'material', materialId: 'iron' })).toBe(true);
    expect(sameRef(iron, { source: 'depot', itemId: 'iron' })).toBe(false);
    expect(sameRef(cavalo, { source: 'depot', itemId: 'outro' })).toBe(false);
  });

  it('keys refs by source and round-trips the key', () => {
    expect(refKey(iron)).toBe('m:iron');
    expect(refKey(cavalo)).toBe('d:cavalo');
    expect(parseRefKey('d:cavalo')).toEqual(cavalo);
    expect(parseRefKey('m:iron')).toEqual(iron);
    expect(parseRefKey('x:iron')).toBeUndefined();
    expect(parseRefKey('d:')).toBeUndefined();
  });

  it('reads names and quantities from the materials or the group depot', () => {
    expect(refName(iron, state, depot)).toBe('Ferro');
    expect(refName(cavalo, state, depot)).toBe('Porção de cavalo');
    expect(refQuantity(iron, state, depot)).toBe(5);
    expect(refQuantity(cavalo, state, depot)).toBe(2);
  });

  it('treats trashed, private and unknown items as missing', () => {
    for (const itemId of ['lixo', 'secreto', 'nada']) {
      const ref: StockRef = { source: 'depot', itemId };
      expect(refExists(ref, state, depot)).toBe(false);
      expect(refName(ref, state, depot)).toBeUndefined();
      expect(refQuantity(ref, state, depot)).toBe(0);
    }
    expect(refExists(cavalo, state, depot)).toBe(true);
    expect(refExists({ source: 'material', materialId: 'nada' }, state, depot)).toBe(false);
  });
});

describe('depotSnapshot', () => {
  it('keeps only the group items asked for, flagging the trashed ones', () => {
    expect(depotSnapshot(fullDepot, ['cavalo', 'lixo', 'secreto'])).toEqual([
      { id: 'cavalo', name: 'Porção de cavalo', quantity: 2, live: true, updatedAt: NOW },
      { id: 'lixo', name: 'Velha', quantity: 2, live: false, updatedAt: NOW },
    ]);
    expect(depotSnapshot(fullDepot, [])).toEqual([]);
  });

  it('names lost items by their last group name only', () => {
    expect(lostName('lixo', depot)).toBe('Velha');
    expect(lostName('secreto', depot)).toBe('');
  });
});

describe('sumMoves', () => {
  it('merges moves on the same item and drops the ones that cancel out', () => {
    expect(
      sumMoves([
        { itemId: 'a', delta: -2, mode: 'strict' },
        { itemId: 'b', delta: 3, mode: 'strict' },
        { itemId: 'a', delta: -1, mode: 'strict' },
        { itemId: 'b', delta: -3, mode: 'strict' },
      ]),
    ).toEqual([{ itemId: 'a', delta: -3, mode: 'strict' }]);
  });

  it('keeps clamp when every spend on the item is clamp', () => {
    expect(
      sumMoves([
        { itemId: 'a', delta: -2, mode: 'clamp' },
        { itemId: 'a', delta: 1, mode: 'strict' },
      ]),
    ).toEqual([{ itemId: 'a', delta: -1, mode: 'clamp' }]);
  });

  it('throws when strict and clamp spends mix on one item', () => {
    expect(() =>
      sumMoves([
        { itemId: 'a', delta: -2, mode: 'clamp' },
        { itemId: 'a', delta: -1, mode: 'strict' },
      ]),
    ).toThrow(/a/);
  });
});

describe('itemLinks', () => {
  const mint = {
    id: 'c1',
    seed: { source: 'depot', itemId: 'cavalo' },
    harvest: { source: 'material', materialId: 'iron' },
    plotType: 'canteiro',
    days: 1,
    yield: 1,
    rare: true,
  } as const;
  const recipe = (id: string, output: StockRef, ingredient: StockRef) => ({
    id,
    output,
    outputQty: 1,
    ingredients: [{ ref: ingredient, quantity: 1 }],
    stationType: 'alambique' as const,
    days: 1,
    hidden: false,
  });
  const linked = withIron(1, {
    garden: { crops: [mint], plots: {} },
    lab: {
      recipes: [
        recipe('r1', cavalo, iron),
        recipe('r2', iron, cavalo),
        recipe('r3', { source: 'material', materialId: 'wood' }, cavalo),
      ],
      stations: {},
    },
  });

  it('findsEveryCropAndRecipeThatUsesTheItem', () => {
    const links = itemLinks(linked, 'cavalo');
    expect(links.seedOf.map((c) => c.id)).toEqual(['c1']);
    expect(links.harvestOf).toEqual([]);
    expect(links.outputOf.map((r) => r.id)).toEqual(['r1']);
    expect(links.ingredientOf.map((r) => r.id)).toEqual(['r2', 'r3']);
  });

  it('findsNothingForAnUnlinkedItem', () => {
    expect(hasLinks(itemLinks(linked, 'lixo'))).toBe(false);
    expect(hasLinks(itemLinks(linked, 'cavalo'))).toBe(true);
  });
});
