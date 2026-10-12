import { describe, expect, it, vi } from 'vitest';
import { ArchiveStore } from '../archiveStore';
import type { Actor } from '../commands/schema';
import { EMPTY_ARCHIVE, type ArchiveImage } from '../systems/Archive';
import { memoryStorage } from '../systems/testFixtures';
import { ARCHIVE_STORAGE_KEY, LocalArchiveRepository } from './LocalArchiveRepository';

const NOW = '2026-10-11T12:00:00.000Z';
const master: Actor = { role: 'master' };
const thorin: Actor = { role: 'player', characterId: 'thorin' };
const topic = { type: 'topic_create', id: 'npcs', name: 'NPCs' } as const;
const secret = {
  type: 'note_create',
  id: 'plano',
  topicId: 'npcs',
  title: 'Plano',
  body: '',
  day: 1,
  pinned: false,
  visibility: 'mestre',
  images: [] as ArchiveImage[],
} as const;

describe('LocalArchiveRepository', () => {
  it('stores what the rules accept and nothing they refuse', async () => {
    const repo = new LocalArchiveRepository(memoryStorage());
    await repo.submit(topic, { viewer: thorin, now: NOW });
    expect(await repo.submit(secret, { viewer: thorin, now: NOW })).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(await repo.load()).toMatchObject({ topics: [{ id: 'npcs' }], notes: [] });
  });

  it('keeps an unreadable archive aside and starts empty', async () => {
    const storage = memoryStorage({ [ARCHIVE_STORAGE_KEY]: '{"topics":1}' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await new LocalArchiveRepository(storage).load()).toEqual(EMPTY_ARCHIVE);
    expect(storage.getItem(`${ARCHIVE_STORAGE_KEY}:corrupted`)).toBe('{"topics":1}');
  });
});

describe('ArchiveStore', () => {
  async function open(viewer: () => Actor) {
    const logged: unknown[] = [];
    const refused: unknown[] = [];
    const store = await ArchiveStore.open(new LocalArchiveRepository(memoryStorage()), {
      viewer,
      now: () => NOW,
      onLogged: (change) => logged.push(change),
      onRefused: (error) => refused.push(error),
      onPersistError: (error) => {
        throw error;
      },
    });
    return { store, logged, refused };
  }

  it('logs public changes and hides master notes from players', async () => {
    let viewer: Actor = master;
    const { store, logged } = await open(() => viewer);
    await store.dispatch(topic);
    await store.dispatch(secret);
    expect(logged).toEqual([{ target: 'topic', action: 'created', title: 'NPCs' }]);
    expect(store.current.notes).toHaveLength(1);

    viewer = thorin;
    expect(store.current.notes).toEqual([]);
    // The exported save keeps them: offline, the file must not lose the master's notes.
    expect(store.stored.notes).toHaveLength(1);
  });

  it('reports refusals', async () => {
    const { store, refused } = await open(() => thorin);
    expect(await store.dispatch({ type: 'trash_empty' })).toBe(false);
    expect(refused).toEqual(['forbidden']);
  });
});
