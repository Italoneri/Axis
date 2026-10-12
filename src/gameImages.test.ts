import { describe, expect, it } from 'vitest';
import { GameImages } from './gameImages';
import { LocalImageStore, memoryBlobTable } from './persistence/LocalImageStore';
import { LocalRepository } from './persistence/LocalRepository';
import { GameStore, type StoreHooks } from './store';
import { parseUploadRef, type ImageTarget } from './systems/GameImages';
import { makeState, memoryStorage, testCatalog } from './systems/testFixtures';

const thorin: ImageTarget = { kind: 'character', id: 'thorin' };
const files = () => ({ full: new Blob(['full']), thumb: new Blob(['thumb']) });

function photoStore() {
  const table = memoryBlobTable();
  let created = 0;
  const urls = { create: () => `blob:${++created}`, revoke: () => undefined };
  const errors: unknown[] = [];
  const images = new GameImages(new LocalImageStore(table, urls), (error) => errors.push(error));
  return { images, table, errors };
}

describe('GameImages', () => {
  it('stores a photo under its record and hands back its reference', async () => {
    const { images, table } = photoStore();
    const ref = await images.upload(thorin, files(), 'webp');
    const upload = parseUploadRef(ref ?? '');
    expect(upload?.target).toEqual(thorin);
    expect(table.keys()).toEqual([
      `character/thorin/${upload?.imageId}.webp`,
      `character/thorin/${upload?.imageId}.thumb.webp`,
    ]);
  });

  it('remembers the URL it handed out, for an instant redraw', async () => {
    const { images } = photoStore();
    const ref = (await images.upload(thorin, files(), 'webp')) ?? '';
    expect(images.peek(ref, 'thumb')).toBeUndefined();
    const url = await images.url(ref, 'thumb');
    expect(images.peek(ref, 'thumb')).toBe(url);
    await expect(images.url('https://example.com/a.png', 'thumb')).rejects.toThrow();
  });

  it('reports a failed upload and resolves to null', async () => {
    const failing = memoryBlobTable();
    failing.put = () => Promise.reject(new Error('quota'));
    const errors: unknown[] = [];
    const images = new GameImages(new LocalImageStore(failing), (error) => errors.push(error));
    expect(await images.upload(thorin, files(), 'webp')).toBeNull();
    expect(errors).toHaveLength(1);
  });

  it('discards a photo whose save was refused', async () => {
    const { images, table } = photoStore();
    const ref = (await images.upload(thorin, files(), 'webp')) ?? '';
    await images.discard(ref);
    expect(table.keys()).toEqual([]);
  });

  it('puts back the photos of an imported save, skipping missing files', async () => {
    const { images, table } = photoStore();
    const state = makeState({
      characters: [
        {
          id: 'thorin',
          name: 'Thorin',
          color: '#aa5500',
          portrait: 'upload:character/thorin/img_a.webp',
        },
      ],
      worldIcons: { human: 'upload:world/human/img_b.jpeg' },
    });
    await images.restore(state, (ref) => (ref.imageId === 'img_a' ? new Blob(['x']) : undefined));
    expect(table.keys().sort()).toEqual([
      'character/thorin/img_a.thumb.webp',
      'character/thorin/img_a.webp',
    ]);
    expect(
      await images.read({ target: thorin, imageId: 'img_a', format: 'webp' }, 'full'),
    ).not.toBeNull();
  });
});

describe('GameStore with photos', () => {
  const hooks = (role: 'master' | 'player' = 'master'): StoreHooks => ({
    contextFor: () =>
      role === 'master'
        ? { actor: { role: 'master' } }
        : { actor: { role: 'player', characterId: 'thorin' } },
    onRefused: () => undefined,
    onPersistError: () => undefined,
  });

  async function open(role: 'master' | 'player' = 'master') {
    const photos = photoStore();
    const storage = memoryStorage();
    const store = await GameStore.open(
      testCatalog,
      new LocalRepository(storage, testCatalog),
      hooks(role),
      photos.images,
    );
    return { store, ...photos };
  }

  it('removes the old file once the new photo is saved', async () => {
    const { store, images, table } = await open();
    const first = (await images.upload(thorin, files(), 'webp')) ?? '';
    store.dispatch({ type: 'set_image', target: thorin, image: first });
    await store.whenSynced();
    const second = (await images.upload(thorin, files(), 'webp')) ?? '';
    store.dispatch({ type: 'set_image', target: thorin, image: second });
    await store.whenSynced();
    await Promise.resolve();

    const kept = parseUploadRef(second)?.imageId;
    expect(table.keys().every((key) => key.includes(`${kept}`))).toBe(true);
    expect(table.keys()).toHaveLength(2);
  });

  it('removes the file when the photo is cleared or its record removed', async () => {
    const { store, images, table } = await open();
    const npcPhoto = (await images.upload({ kind: 'npc', id: 'npc_1' }, files(), 'webp')) ?? '';
    store.dispatch({
      type: 'npc_create',
      id: 'npc_1',
      name: 'Bianca',
      title: '',
      description: '',
      skills: {},
      portrait: npcPhoto,
    });
    await store.whenSynced();
    expect(table.keys()).toHaveLength(2);
    store.dispatch({ type: 'npc_remove', npcId: 'npc_1' });
    await store.whenSynced();
    await Promise.resolve();
    expect(table.keys()).toEqual([]);
  });

  it('tells which photos this device may change', async () => {
    const { store } = await open('player');
    const own = { type: 'set_image', target: thorin } as const;
    const other = { type: 'set_image', target: { kind: 'npc', id: 'bianca' } } as const;
    expect(store.allows(own)).toBe(true);
    expect(store.allows(other)).toBe(false);
  });
});
