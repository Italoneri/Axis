import { describe, expect, it } from 'vitest';
import type { Actor } from '../commands/schema';
import type { Depot, DepotItem, DepotSection } from '../systems/Depot';
import {
  applyDepotRowEvent,
  depotFromRows,
  itemToRow,
  sectionToRow,
  SupabaseDepotRepository,
  type DepotBackend,
  type DepotRowsChange,
} from './SupabaseDepotRepository';

const NOW = '2026-10-14T12:00:00.000Z';
const thorin: Actor = { role: 'player', characterId: 'thorin' };
const pocoes: DepotSection = {
  id: 'pocoes',
  name: 'Poções',
  ownerId: null,
  order: 0,
  authorId: 'mestre',
  deletedAt: null,
};
const bau: DepotSection = { ...pocoes, id: 'bau', name: 'Baú', ownerId: 'thorin' };
const cura: DepotItem = {
  id: 'cura',
  sectionId: 'pocoes',
  name: 'Poção de cura',
  kind: 'pocao',
  quantity: 3,
  notes: '2d4+2',
  order: 0,
  authorId: 'mestre',
  editedBy: 'thorin',
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
};
const depot: Depot = { sections: [pocoes, bau], items: [cura] };

function fakeBackend() {
  const writes: DepotRowsChange[] = [];
  const backend: DepotBackend = {
    fetchRows: () =>
      Promise.resolve({
        sections: depot.sections.map(sectionToRow),
        items: depot.items.map((item) => itemToRow(item, depot)),
      }),
    writeRows: (_gameId, change) => {
      writes.push(change);
      return Promise.resolve({ ok: true });
    },
    replaceRows: () => Promise.resolve({ ok: true }),
    watch: () => () => undefined,
  };
  return { backend, writes };
}

describe('depot rows', () => {
  it('round-trips records through rows, with the owner copied onto items', () => {
    const rows = {
      sections: depot.sections.map(sectionToRow),
      items: depot.items.map((item) => itemToRow(item, depot)),
    };
    expect(depotFromRows(rows)).toEqual(depot);
    expect(rows.items[0]).toMatchObject({ owner_id: null, section_id: 'pocoes', position: 0 });
  });

  it('applies realtime upserts and deletes', () => {
    const renamed = { ...itemToRow(cura, depot), name: 'Cura' };
    expect(
      applyDepotRowEvent(depot, { table: 'depot_items', kind: 'upsert', row: renamed })?.items,
    ).toEqual([{ ...cura, name: 'Cura' }]);
    expect(
      applyDepotRowEvent(depot, { table: 'depot_sections', kind: 'delete', id: 'pocoes' }),
    ).toEqual({ sections: [bau], items: [] });
    expect(applyDepotRowEvent(depot, { table: 'depot_items', kind: 'delete', id: 'x' })).toBeNull();
  });
});

describe('SupabaseDepotRepository', () => {
  it('writes the moved item with its new area as owner', async () => {
    const { backend, writes } = fakeBackend();
    const repo = new SupabaseDepotRepository(backend, 'game');
    const result = await repo.submit(
      { type: 'item_move', itemId: 'cura', sectionId: 'bau' },
      { viewer: thorin, now: NOW },
    );
    expect(result).toMatchObject({ ok: true, change: { action: 'taken' } });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.items).toEqual([
      expect.objectContaining({ id: 'cura', section_id: 'bau', owner_id: 'thorin' }),
    ]);
  });
});
