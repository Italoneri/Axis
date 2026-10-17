import { describe, expect, it, vi } from 'vitest';
import { DepotStore } from '../depotStore';
import type { Actor } from '../commands/schema';
import { EMPTY_DEPOT } from '../systems/Depot';
import { memoryStorage } from '../systems/testFixtures';
import { DEPOT_STORAGE_KEY, LocalDepotRepository } from './LocalDepotRepository';

const NOW = '2026-10-14T12:00:00.000Z';
const thorin: Actor = { role: 'player', characterId: 'thorin' };
const bia: Actor = { role: 'player', characterId: 'bia' };
const shared = { type: 'section_create', id: 'pocoes', ownerId: null, name: 'Poções' } as const;
const mine = { type: 'section_create', id: 'bau', ownerId: 'thorin', name: 'Baú' } as const;

describe('LocalDepotRepository', () => {
  it('stores what the rules accept and nothing they refuse', async () => {
    const repo = new LocalDepotRepository(memoryStorage());
    await repo.submit(shared, { viewer: thorin, now: NOW });
    expect(await repo.submit({ ...mine, ownerId: 'bia' }, { viewer: thorin, now: NOW })).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(await repo.load()).toMatchObject({ sections: [{ id: 'pocoes' }], items: [] });
  });

  it('deliversIntoLocalStorage', async () => {
    const storage = memoryStorage();
    await new LocalDepotRepository(storage).deliver(
      {
        itemId: 'compra-1',
        ownerId: 'thorin',
        authorId: 'thorin',
        name: 'Espada',
        kind: 'equipamento',
        quantity: 1,
        notes: '',
      },
      NOW,
    );
    const depot = await new LocalDepotRepository(storage).load();
    expect(depot.sections.map((s) => s.name)).toEqual(['Compras do Entreposto']);
    expect(depot.items).toMatchObject([{ id: 'compra-1', name: 'Espada', quantity: 1 }]);
  });

  it('keeps an unreadable depot aside and starts empty', async () => {
    const storage = memoryStorage({ [DEPOT_STORAGE_KEY]: '{"sections":1}' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await new LocalDepotRepository(storage).load()).toEqual(EMPTY_DEPOT);
    expect(storage.getItem(`${DEPOT_STORAGE_KEY}:corrupted`)).toBe('{"sections":1}');
  });
});

describe('DepotStore', () => {
  it('shows each viewer only their area and logs only the group depot', async () => {
    let viewer: Actor = thorin;
    const logged: unknown[] = [];
    const store = await DepotStore.open(new LocalDepotRepository(memoryStorage()), {
      viewer: () => viewer,
      onLogged: (change) => logged.push(change),
      onRefused: () => undefined,
      onPersistError: () => undefined,
      now: () => NOW,
    });
    expect(await store.dispatch(shared)).toBe(true);
    expect(await store.dispatch(mine)).toBe(true);
    expect(store.current.sections.map((s) => s.id)).toEqual(['pocoes', 'bau']);
    expect(logged).toEqual([{ target: 'section', action: 'created', title: 'Poções' }]);
    viewer = bia;
    expect(store.current.sections.map((s) => s.id)).toEqual(['pocoes']);
    expect(store.stored.sections).toHaveLength(2);
  });
});
