import { describe, expect, it } from 'vitest';
import type { CommandContext } from '../commands/schema';
import { HERB_GARDEN_BUILDING_ID } from '../model/catalog';
import { persistState } from '../systems/SaveSystem';
import { herbGardenCatalog, makeState, memoryStorage, testCatalog } from '../systems/testFixtures';
import { LocalDepotRepository } from './LocalDepotRepository';
import { LocalRepository } from './LocalRepository';

const master: CommandContext = { actor: { role: 'master' } };
const player: CommandContext = { actor: { role: 'player', characterId: 'thorin' } };
const advance = { kind: 'command', command: { type: 'advance_days', days: 1 } } as const;

function repository() {
  return new LocalRepository(memoryStorage(), testCatalog);
}

describe('LocalRepository', () => {
  it('applies a command to the stored game and keeps it', async () => {
    const repo = repository();
    const result = await repo.submit({ ...advance, ctx: master }, 0);
    expect(result).toMatchObject({ ok: true, state: { day: 2, revision: 1 } });
    expect(await repo.load()).toMatchObject({ day: 2, revision: 1 });
  });

  it('refuses what the rules refuse, without storing anything', async () => {
    const repo = repository();
    expect(await repo.submit({ ...advance, ctx: player }, 0)).toEqual({
      ok: false,
      reason: 'refused',
      error: 'forbidden',
    });
    expect((await repo.load()).revision).toBe(0);
  });

  it('reports a conflict when the stored revision moved on', async () => {
    const repo = repository();
    await repo.submit({ ...advance, ctx: master }, 0);
    expect(await repo.submit({ ...advance, ctx: master }, 0)).toEqual({
      ok: false,
      reason: 'conflict',
    });
  });

  it('restores an imported save as the next revision', async () => {
    const repo = repository();
    const result = await repo.submit({ kind: 'restore', state: makeState({ day: 9 }) }, 0);
    expect(result).toEqual({ ok: true, state: makeState({ day: 9, revision: 1 }) });
  });
});

describe('LocalRepository with the depot', () => {
  const NOW = '2026-10-19T12:00:00.000Z';
  const crop = {
    id: 'crop_hortela',
    seed: { source: 'depot', itemId: 'sem' },
    harvest: { source: 'depot', itemId: 'erva' },
    plotType: 'canteiro',
    days: 1,
    yield: 3,
    rare: true,
  } as const;
  const item = (id: string, name: string, quantity: number) => ({
    id,
    sectionId: 'porcoes',
    name,
    kind: 'outro' as const,
    quantity,
    notes: '',
    order: 0,
    authorId: 'mestre',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  });
  const plant = {
    kind: 'command',
    command: { type: 'garden_plant', plotId: 'canteiro-1', cropId: 'crop_hortela', buy: false },
    // What the page believed: the repository reads the stored depot again.
    ctx: { ...player, depot: [] },
  } as const;

  function setup(seeds: number) {
    const storage = memoryStorage();
    const depot = new LocalDepotRepository(storage);
    void depot.replace({
      sections: [
        {
          id: 'porcoes',
          name: 'porções',
          ownerId: null,
          order: 0,
          authorId: 'mestre',
          deletedAt: null,
        },
      ],
      items: [item('sem', 'Semente de Hortelã', seeds), item('erva', 'Hortelã', 0)],
    });
    const state = makeState({
      slots: { outer_n: { buildingId: HERB_GARDEN_BUILDING_ID, level: 1, status: 'done' } },
      garden: { crops: [crop], plots: {} },
    });
    persistState(storage, state);
    const repo = new LocalRepository(storage, herbGardenCatalog, undefined, depot);
    const seedsLeft = async () => (await depot.load()).items.find((i) => i.id === 'sem')?.quantity;
    return { repo, depot, seedsLeft };
  }

  it('offlineSuccessUpdatesBoth', async () => {
    const { repo, seedsLeft } = setup(2);
    const result = await repo.submit(plant, 0);
    expect(result).toMatchObject({ ok: true, state: { revision: 1 } });
    expect(await seedsLeft()).toBe(1);
    expect((await repo.load()).log.at(-1)).toMatchObject({
      kind: 'garden_planted',
      seed: 'Semente de Hortelã',
    });
  });

  it('offlineShortageLeavesBothStores', async () => {
    const { repo, seedsLeft } = setup(0);
    expect(await repo.submit(plant, 0)).toEqual({ ok: false, reason: 'refused', error: 'no_seed' });
    expect(await seedsLeft()).toBe(0);
    expect((await repo.load()).revision).toBe(0);
  });

  it('readsTheNameTheDepotHasAtTheCommit', async () => {
    const { repo, depot } = setup(2);
    await depot.submit(
      {
        type: 'item_update',
        itemId: 'sem',
        name: 'Semente nova',
        kind: 'outro',
        quantity: 2,
        notes: '',
      },
      { viewer: { role: 'master' }, now: NOW },
    );
    await repo.submit(plant, 0);
    expect((await repo.load()).log.at(-1)).toMatchObject({ seed: 'Semente nova' });
  });
});
