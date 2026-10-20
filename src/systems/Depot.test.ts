import { describe, expect, it } from 'vitest';
import type { Actor } from '../commands/schema';
import {
  activeSections,
  applyDepotCommand,
  applyStock,
  QUANTITY_LIMIT,
  depotCounts,
  deliverToDepot,
  depotDiff,
  EMPTY_DEPOT,
  parseDepot,
  searchItems,
  SHOP_SECTION_NAME,
  shopSectionId,
  sectionItems,
  visibleDepot,
  type Depot,
  type DepotCommand,
  type DepotItem,
  type DepotSection,
} from './Depot';

const master: Actor = { role: 'master' };
const thorin: Actor = { role: 'player', characterId: 'thorin' };
const bia: Actor = { role: 'player', characterId: 'bia' };
const NOW = '2026-10-14T12:00:00.000Z';

function section(id: string, name: string, ownerId: string | null, order = 0): DepotSection {
  return { id, name, ownerId, order, authorId: 'mestre', deletedAt: null };
}

function item(id: string, sectionId: string, extra: Partial<DepotItem> = {}): DepotItem {
  return {
    id,
    sectionId,
    name: id,
    kind: 'outro',
    quantity: 1,
    notes: '',
    order: 0,
    authorId: 'mestre',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...extra,
  };
}

const base: Depot = {
  sections: [
    section('pocoes', 'Poções', null, 0),
    section('armas', 'Armas', null, 1),
    section('bau-thorin', 'Baú', 'thorin'),
    section('mochila-bia', 'Mochila', 'bia'),
  ],
  items: [
    item('cura', 'pocoes', { name: 'Poção de cura', kind: 'pocao', quantity: 3 }),
    item('espada', 'armas', { name: 'Espada longa', kind: 'equipamento', notes: '1d8 cortante' }),
    item('escudo', 'bau-thorin', { name: 'Escudo', kind: 'equipamento' }),
    item('adaga', 'mochila-bia', { name: 'Adaga +1', kind: 'equipamento' }),
  ],
};

function run(command: DepotCommand, viewer: Actor, depot: Depot = base) {
  return applyDepotCommand(depot, command, { viewer, now: NOW });
}

function ok(command: DepotCommand, viewer: Actor, depot: Depot = base) {
  const outcome = run(command, viewer, depot);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome;
}

const newItem = { name: 'Corda', kind: 'outro', quantity: 2, notes: '15 m' } as const;

describe('depot visibility', () => {
  it('shows a player the group depot and only their own private area', () => {
    const seen = visibleDepot(base, thorin);
    expect(seen.sections.map((s) => s.id)).toEqual(['pocoes', 'armas', 'bau-thorin']);
    expect(seen.items.map((i) => i.id)).toEqual(['cura', 'espada', 'escudo']);
  });

  it('shows the master every area', () => {
    expect(visibleDepot(base, master)).toBe(base);
  });

  it('shows a player without a character only the group depot', () => {
    const seen = visibleDepot(base, { role: 'player' });
    expect(seen.sections.map((s) => s.id)).toEqual(['pocoes', 'armas']);
  });

  it('lists an area in order', () => {
    expect(activeSections(base, null).map((s) => s.id)).toEqual(['pocoes', 'armas']);
    expect(activeSections(base, 'bia').map((s) => s.id)).toEqual(['mochila-bia']);
  });
});

describe('depot sections', () => {
  it('lets a player open a section in the group depot, logged', () => {
    const outcome = ok(
      { type: 'section_create', id: 'mapas', ownerId: null, name: ' Mapas ', icon: '🗺️' },
      thorin,
    );
    expect(outcome.depot.sections.at(-1)).toMatchObject({
      id: 'mapas',
      name: 'Mapas',
      icon: '🗺️',
      ownerId: null,
      order: 2,
      authorId: 'thorin',
    });
    expect(outcome.change).toEqual({ target: 'section', action: 'created', title: 'Mapas' });
  });

  it('lets a player open a section in their own area, not logged', () => {
    const outcome = ok(
      { type: 'section_create', id: 'x', ownerId: 'thorin', name: 'Bolsa' },
      thorin,
    );
    expect(outcome.change).toBeNull();
  });

  it('refuses a section in another character area', () => {
    expect(run({ type: 'section_create', id: 'x', ownerId: 'bia', name: 'Hack' }, thorin)).toEqual({
      ok: false,
      error: 'forbidden',
    });
  });

  it('lets the master open a section in any area', () => {
    expect(run({ type: 'section_create', id: 'x', ownerId: 'bia', name: 'Joias' }, master).ok).toBe(
      true,
    );
  });

  it('refuses a repeated name only within the same area', () => {
    expect(run({ type: 'section_create', id: 'x', ownerId: null, name: 'poções' }, thorin)).toEqual(
      {
        ok: false,
        error: 'duplicate_name',
      },
    );
    expect(
      run({ type: 'section_create', id: 'x', ownerId: 'thorin', name: 'Poções' }, thorin).ok,
    ).toBe(true);
  });

  it('hides another character section as not found', () => {
    expect(run({ type: 'section_update', sectionId: 'mochila-bia', name: 'x' }, thorin)).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('refuses to trash a section with items, then trashes and restores it empty', () => {
    expect(run({ type: 'section_remove', sectionId: 'armas' }, thorin)).toEqual({
      ok: false,
      error: 'category_not_empty',
    });
    const emptied = ok({ type: 'item_remove', itemId: 'espada' }, thorin).depot;
    const removed = ok({ type: 'section_remove', sectionId: 'armas' }, thorin, emptied);
    expect(activeSections(removed.depot, null).map((s) => s.id)).toEqual(['pocoes']);
    const restored = ok({ type: 'section_restore', sectionId: 'armas' }, bia, removed.depot);
    expect(restored.change).toEqual({ target: 'section', action: 'restored', title: 'Armas' });
  });

  it('reorders sections within their area', () => {
    const outcome = ok({ type: 'section_shift', sectionId: 'armas', direction: 'up' }, thorin);
    expect(activeSections(outcome.depot, null).map((s) => s.id)).toEqual(['armas', 'pocoes']);
  });
});

describe('depot items', () => {
  it('stores an item in the group depot, logged with its quantity', () => {
    const outcome = ok({ type: 'item_create', id: 'corda', sectionId: 'armas', ...newItem }, bia);
    expect(outcome.depot.items.at(-1)).toMatchObject({
      id: 'corda',
      name: 'Corda',
      quantity: 2,
      notes: '15 m',
      authorId: 'bia',
    });
    expect(outcome.change).toEqual({
      target: 'item',
      action: 'created',
      title: 'Corda',
      quantity: 2,
    });
  });

  it('never logs what happens in a private area', () => {
    const created = ok(
      { type: 'item_create', id: 'corda', sectionId: 'bau-thorin', ...newItem },
      thorin,
    );
    expect(created.change).toBeNull();
    expect(ok({ type: 'item_adjust', itemId: 'escudo', delta: 1 }, thorin).change).toBeNull();
    expect(ok({ type: 'item_remove', itemId: 'escudo' }, thorin).change).toBeNull();
  });

  it('refuses items in another character area', () => {
    expect(
      run({ type: 'item_create', id: 'x', sectionId: 'mochila-bia', ...newItem }, thorin),
    ).toEqual({ ok: false, error: 'not_found' });
    expect(run({ type: 'item_adjust', itemId: 'adaga', delta: 1 }, thorin)).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('checks the quantity', () => {
    expect(
      run({ type: 'item_create', id: 'x', sectionId: 'armas', ...newItem, quantity: -1 }, thorin),
    ).toEqual({ ok: false, error: 'invalid_quantity' });
    expect(run({ type: 'item_adjust', itemId: 'espada', delta: -2 }, thorin)).toEqual({
      ok: false,
      error: 'invalid_quantity',
    });
  });

  it('lets an item run out and stay at zero', () => {
    const created = ok(
      { type: 'item_create', id: 'x', sectionId: 'armas', ...newItem, quantity: 0 },
      thorin,
    );
    expect(created.depot.items.at(-1)).toMatchObject({ id: 'x', quantity: 0 });
    const emptied = ok({ type: 'item_adjust', itemId: 'espada', delta: -1 }, thorin);
    expect(emptied.depot.items.find((i) => i.id === 'espada')?.quantity).toBe(0);
    const updated = ok({ type: 'item_update', itemId: 'cura', ...newItem, quantity: 0 }, thorin);
    expect(updated.depot.items.find((i) => i.id === 'cura')?.quantity).toBe(0);
    expect(parseDepot(updated.depot).ok).toBe(true);
  });

  it('adds and takes units with + and -', () => {
    const outcome = ok({ type: 'item_adjust', itemId: 'cura', delta: -1 }, thorin);
    expect(outcome.depot.items.find((i) => i.id === 'cura')).toMatchObject({
      quantity: 2,
      editedBy: 'thorin',
    });
    expect(outcome.change).toEqual({
      target: 'item',
      action: 'edited',
      title: 'Poção de cura',
      quantity: 2,
    });
  });

  it('edits an item, and an unchanged edit is a no-op', () => {
    const fields = {
      name: 'Espada longa',
      kind: 'equipamento',
      quantity: 1,
      notes: '1d8 cortante',
    };
    const same = ok({ type: 'item_update', itemId: 'espada', ...fields } as DepotCommand, thorin);
    expect(same.depot).toBe(base);
    const edited = ok(
      { type: 'item_update', itemId: 'espada', ...fields, quantity: 2 } as DepotCommand,
      thorin,
    );
    expect(edited.change).toMatchObject({ action: 'edited', quantity: 2 });
  });

  it('logs moves in the group depot, and takes/stores across a private area without its name', () => {
    const moved = ok({ type: 'item_move', itemId: 'cura', sectionId: 'armas' }, thorin);
    expect(moved.change).toEqual({
      target: 'item',
      action: 'moved',
      title: 'Poção de cura',
      quantity: 3,
      from: 'Poções',
      to: 'Armas',
    });
    const taken = ok({ type: 'item_move', itemId: 'cura', sectionId: 'bau-thorin' }, thorin);
    expect(taken.change).toEqual({
      target: 'item',
      action: 'taken',
      title: 'Poção de cura',
      quantity: 3,
      from: 'Poções',
    });
    expect(sectionItems(taken.depot, 'bau-thorin').map((i) => i.id)).toEqual(['escudo', 'cura']);
    const stored = ok({ type: 'item_move', itemId: 'escudo', sectionId: 'armas' }, thorin);
    expect(stored.change).toEqual({
      target: 'item',
      action: 'stored',
      title: 'Escudo',
      quantity: 1,
      to: 'Armas',
    });
  });

  it('never lets a player move an item into another character area', () => {
    expect(run({ type: 'item_move', itemId: 'cura', sectionId: 'mochila-bia' }, thorin)).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('lets the master move between private areas without a log entry', () => {
    const outcome = ok({ type: 'item_move', itemId: 'adaga', sectionId: 'bau-thorin' }, master);
    expect(outcome.change).toBeNull();
  });

  it('restores an item together with its trashed section', () => {
    const emptied = ok({ type: 'item_remove', itemId: 'escudo' }, thorin).depot;
    const trashed = ok({ type: 'section_remove', sectionId: 'bau-thorin' }, thorin, emptied).depot;
    const restored = ok({ type: 'item_restore', itemId: 'escudo' }, thorin, trashed).depot;
    expect(sectionItems(restored, 'bau-thorin').map((i) => i.id)).toEqual(['escudo']);
    expect(run({ type: 'item_restore', itemId: 'escudo' }, bia, trashed)).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('lets only the master empty the trash', () => {
    const trashed = ok({ type: 'item_remove', itemId: 'cura' }, thorin).depot;
    expect(run({ type: 'trash_empty' }, thorin, trashed)).toEqual({
      ok: false,
      error: 'forbidden',
    });
    const emptied = ok({ type: 'trash_empty' }, master, trashed);
    expect(emptied.depot.items.some((i) => i.id === 'cura')).toBe(false);
  });

  it('asks an offline player to pick a character first', () => {
    expect(
      run({ type: 'section_create', id: 'x', ownerId: null, name: 'X' }, { role: 'player' }),
    ).toEqual({ ok: false, error: 'no_author' });
  });
});

describe('depot queries', () => {
  it('searches names and notes ignoring accents', () => {
    expect(searchItems(base, 'pocao').map((i) => i.id)).toEqual(['cura']);
    expect(searchItems(base, 'CORTANTE').map((i) => i.id)).toEqual(['espada']);
    expect(searchItems(visibleDepot(base, thorin), 'adaga')).toEqual([]);
  });

  it('counts sections and items in use', () => {
    expect(depotCounts(base)).toEqual({ sections: 4, items: 4 });
    expect(depotCounts(visibleDepot(base, bia))).toEqual({ sections: 3, items: 3 });
  });

  it('diffs only what changed', () => {
    const after = ok({ type: 'item_adjust', itemId: 'cura', delta: 1 }, thorin).depot;
    const diff = depotDiff(base, after);
    expect(diff.items.map((i) => i.id)).toEqual(['cura']);
    expect(diff.sections).toEqual([]);
  });

  it('parses a stored depot and rejects a broken one', () => {
    expect(parseDepot(JSON.parse(JSON.stringify(base)))).toEqual({ ok: true, depot: base });
    expect(parseDepot({ sections: 1 }).ok).toBe(false);
    expect(parseDepot(EMPTY_DEPOT)).toEqual({ ok: true, depot: EMPTY_DEPOT });
  });
});

describe('deliverToDepot', () => {
  const delivery = {
    itemId: 'd1',
    ownerId: 'thorin',
    authorId: 'thorin',
    name: 'Espada longa',
    kind: 'equipamento',
    quantity: 1,
    notes: '1d8',
  } as const;
  const LATER = '2026-10-15T12:00:00.000Z';

  it('createsShopSectionOnce', () => {
    const first = deliverToDepot(EMPTY_DEPOT, delivery, NOW);
    const second = deliverToDepot(first, { ...delivery, itemId: 'd2', name: 'Adaga' }, LATER);
    expect(second.sections).toEqual([
      {
        id: shopSectionId('thorin'),
        name: SHOP_SECTION_NAME,
        ownerId: 'thorin',
        order: 0,
        authorId: 'thorin',
        deletedAt: null,
      },
    ]);
    expect(second.items.map((i) => [i.id, i.order])).toEqual([
      ['d1', 0],
      ['d2', 1],
    ]);
    expect(second.items[0]).toMatchObject({ createdAt: NOW, updatedAt: NOW, deletedAt: null });
  });

  it('namesTheGroupSectionAfterTheGroup', () => {
    expect(shopSectionId(null)).toBe('entreposto-grupo');
    expect(shopSectionId('a'.repeat(80))).toHaveLength(64);
  });

  it('reusesSectionWithSameNameInArea', () => {
    const own = section('minhas-compras', SHOP_SECTION_NAME, 'thorin');
    const result = deliverToDepot({ sections: [own], items: [] }, delivery, NOW);
    expect(result.sections).toEqual([own]);
    expect(result.items[0]?.sectionId).toBe('minhas-compras');
  });

  it('restoresTrashedShopSection', () => {
    const trashed = {
      ...section(shopSectionId('thorin'), SHOP_SECTION_NAME, 'thorin'),
      deletedAt: LATER,
    };
    const result = deliverToDepot({ sections: [trashed], items: [] }, delivery, NOW);
    expect(result.sections).toEqual([{ ...trashed, deletedAt: null }]);
  });

  it('ignoresSectionWithShopIdInAnotherArea', () => {
    const thorins = section('entreposto-lyra', 'Meu baú', 'thorin');
    const result = deliverToDepot(
      { sections: [thorins], items: [] },
      { ...delivery, ownerId: 'lyra' },
      NOW,
    );
    const hers = result.sections.find((s) => s.ownerId === 'lyra');
    expect(result.sections.find((s) => s.id === 'entreposto-lyra')).toEqual(thorins);
    expect(hers).toMatchObject({ id: 'entreposto-d1', name: SHOP_SECTION_NAME, deletedAt: null });
    expect(result.items[0]?.sectionId).toBe('entreposto-d1');
  });

  it('keepsTrashedShopSectionOfAnotherAreaInTheTrash', () => {
    const thorins = {
      ...section('entreposto-lyra', SHOP_SECTION_NAME, 'thorin'),
      deletedAt: LATER,
    };
    const result = deliverToDepot(
      { sections: [thorins], items: [] },
      { ...delivery, ownerId: 'lyra' },
      NOW,
    );
    expect(result.sections).toContainEqual(thorins);
    expect(result.items[0]?.sectionId).not.toBe('entreposto-lyra');
  });
});

describe('applyStock', () => {
  const LATER = '2026-10-19T09:00:00.000Z';
  const stock: Depot = {
    ...base,
    sections: [...base.sections, { ...section('velha', 'Velha', null, 2), deletedAt: NOW }],
    items: [
      ...base.items,
      item('hortela', 'pocoes', { name: 'Hortelã', quantity: 2 }),
      item('lixo', 'pocoes', { quantity: 4, deletedAt: NOW }),
      item('cheio', 'pocoes', { quantity: QUANTITY_LIMIT - 1 }),
    ],
  };
  const quantityOf = (depot: Depot, id: string) => depot.items.find((i) => i.id === id)?.quantity;

  it('applyStockStrictShort', () => {
    expect(applyStock(stock, [{ itemId: 'hortela', delta: -3, mode: 'strict' }], LATER)).toEqual({
      ok: false,
      error: 'stock_short',
      itemId: 'hortela',
    });
  });

  it('spends a strict move that fits', () => {
    const outcome = applyStock(stock, [{ itemId: 'hortela', delta: -2, mode: 'strict' }], LATER);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.depot.items.find((i) => i.id === 'hortela')).toMatchObject({
      quantity: 0,
      updatedAt: LATER,
    });
    expect(outcome.lost).toEqual([]);
  });

  it('applyStockClamp', () => {
    const outcome = applyStock(stock, [{ itemId: 'hortela', delta: -5, mode: 'clamp' }], LATER);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(quantityOf(outcome.depot, 'hortela')).toBe(0);
  });

  it('applyStockCapsAtLimit', () => {
    const outcome = applyStock(stock, [{ itemId: 'cheio', delta: 5, mode: 'strict' }], LATER);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(quantityOf(outcome.depot, 'cheio')).toBe(QUANTITY_LIMIT);
  });

  it('applyStockRefusesPrivateItem', () => {
    for (const itemId of ['escudo', 'lixo', 'nada']) {
      expect(applyStock(stock, [{ itemId, delta: -1, mode: 'clamp' }], LATER)).toEqual({
        ok: false,
        error: 'stock_missing',
        itemId,
      });
    }
  });

  it('gainOnTrashedItemIsLost', () => {
    const outcome = applyStock(
      stock,
      [
        { itemId: 'lixo', delta: 2, mode: 'strict' },
        { itemId: 'escudo', delta: 1, mode: 'strict' },
        { itemId: 'hortela', delta: 1, mode: 'strict' },
      ],
      LATER,
    );
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.lost).toEqual(['lixo', 'escudo']);
    expect(quantityOf(outcome.depot, 'lixo')).toBe(4);
    expect(quantityOf(outcome.depot, 'escudo')).toBe(1);
    expect(quantityOf(outcome.depot, 'hortela')).toBe(3);
  });

  it('allOrNothing', () => {
    const outcome = applyStock(
      stock,
      [
        { itemId: 'cura', delta: -1, mode: 'strict' },
        { itemId: 'hortela', delta: -9, mode: 'strict' },
      ],
      LATER,
    );
    expect(outcome).toEqual({ ok: false, error: 'stock_short', itemId: 'hortela' });
    expect(quantityOf(stock, 'cura')).toBe(3);
  });

  it('keeps the same depot when there is nothing to move', () => {
    const outcome = applyStock(stock, [], LATER);
    expect(outcome).toEqual({ ok: true, depot: stock, lost: [] });
  });
});
