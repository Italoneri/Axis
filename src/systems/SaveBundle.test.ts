import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ArchiveStore } from '../archiveStore';
import { GameImages } from '../gameImages';
import { LocalRepository } from '../persistence/LocalRepository';
import { GameStore } from '../store';
import type { Actor } from '../commands/schema';
import { LocalArchiveRepository } from '../persistence/LocalArchiveRepository';
import { LocalImageStore, memoryBlobTable } from '../persistence/LocalImageStore';
import type { Archive, ArchiveImage } from './Archive';
import {
  archiveImageFiles,
  bundleImagePath,
  bundlePhotoPath,
  bundleSave,
  hasArchiveImages,
  isZip,
  photoFiles,
  readBundle,
} from './SaveBundle';
import { parseSave, parseSaveArchive, serializeSave, STORAGE_KEY } from './SaveSystem';
import { makeState, memoryStorage, npc, testCatalog } from './testFixtures';

const NOW = '2026-10-12T12:00:00.000Z';
const master: Actor = { role: 'master' };
const image = (id: string): ArchiveImage => ({
  id,
  caption: `legenda ${id}`,
  width: 800,
  height: 600,
  bytes: 4,
  format: 'webp',
});
const archive: Archive = {
  topics: [{ id: 'npcs', name: 'NPCs', order: 0, authorId: 'mestre', deletedAt: null }],
  notes: [
    {
      id: 'mapa',
      topicId: 'npcs',
      title: 'Mapa do Portão Oito',
      body: '',
      day: 1,
      pinned: false,
      visibility: 'todos',
      order: 0,
      authorId: 'mestre',
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      images: [image('portao'), image('rio')],
    },
  ],
};
const bytesOf = (text: string) => new TextEncoder().encode(text);

async function openArchive(stored: Archive | null = null) {
  const files = memoryBlobTable();
  const images = new LocalImageStore(files, { create: () => 'blob:x', revoke: () => undefined });
  const repository = new LocalArchiveRepository(memoryStorage());
  if (stored) await repository.replace(stored);
  const store = await ArchiveStore.open(repository, images, {
    viewer: () => master,
    onLogged: () => undefined,
    onRefused: () => undefined,
    onPersistError: (error) => {
      throw error;
    },
  });
  return { store, files };
}

describe('save bundles', () => {
  it('tells a zip from a JSON save', () => {
    expect(isZip(bundleSave('{}', new Map()))).toBe(true);
    expect(isZip(bytesOf('{"version":5}'))).toBe(false);
  });

  it('lists both files of every image', () => {
    expect(hasArchiveImages(archive)).toBe(true);
    expect(
      archiveImageFiles(archive).map(({ ref, variant }) => bundleImagePath(ref, variant)),
    ).toEqual([
      'images/mapa/portao.webp',
      'images/mapa/portao.thumb.webp',
      'images/mapa/rio.webp',
      'images/mapa/rio.thumb.webp',
    ]);
  });

  it('refuses a zip without save.json, or one it cannot open', () => {
    const onlyImages = zipSync({ 'images/mapa/portao.webp': bytesOf('x') });
    expect(readBundle(onlyImages)).toEqual({ ok: false, error: 'zip: save.json is missing' });
    expect(readBundle(bundleSave('{}', new Map()).slice(0, 10))).toMatchObject({ ok: false });
  });

  it('carries the archive images from one browser to another, offline', async () => {
    const source = await openArchive(archive);
    for (const { ref, variant } of archiveImageFiles(archive)) {
      await source.files.put(
        `${ref.noteId}/${ref.image.id}${variant === 'thumb' ? '.thumb' : ''}.webp`,
        new Blob([`${ref.image.id}-${variant}`]),
      );
    }

    // Export, as SaveControls does.
    const files = new Map<string, Uint8Array>();
    for (const { ref, variant } of archiveImageFiles(source.store.stored)) {
      const blob = await source.store.readImage(ref.noteId, ref.image, variant);
      if (blob) files.set(bundleImagePath(ref, variant), new Uint8Array(await blob.arrayBuffer()));
    }
    const zip = bundleSave(serializeSave(makeState(), source.store.stored), files);

    // Import into a browser that had an older archive with another image.
    const old: Archive = {
      ...archive,
      notes: archive.notes.map((note) => ({ ...note, id: 'antiga', images: [image('velha')] })),
    };
    const target = await openArchive(old);
    await target.files.put('antiga/velha.webp', new Blob(['old']));
    await target.files.put('antiga/velha.thumb.webp', new Blob(['old']));

    const bundle = readBundle(zip);
    if (!bundle.ok) throw new Error(bundle.error);
    expect(parseSave(bundle.saveText, testCatalog).ok).toBe(true);
    const records = parseSaveArchive(bundle.saveText);
    if (!records.ok || !records.archive) throw new Error('archive missing from the save');
    await target.store.replace(records.archive, (ref, variant) => {
      const data = bundle.files.get(bundleImagePath(ref, variant));
      return data && new Blob([data.slice()]);
    });

    expect(target.store.stored.notes[0]?.images.map((i) => i.caption)).toEqual([
      'legenda portao',
      'legenda rio',
    ]);
    expect(target.files.keys().sort()).toEqual([
      'mapa/portao.thumb.webp',
      'mapa/portao.webp',
      'mapa/rio.thumb.webp',
      'mapa/rio.webp',
    ]);
    const thumb = await target.store.readImage('mapa', image('rio'), 'thumb');
    expect(await thumb?.text()).toBe('rio-thumb');
  });

  it('carries the photos sent in game, and drops those the import lacks', async () => {
    const thorinPhoto = 'upload:character/thorin/img_t.webp';
    const npcPhoto = 'upload:npc/bianca/img_b.jpeg';
    const exported = makeState({
      characters: [{ id: 'thorin', name: 'Thorin', color: '#aa5500', portrait: thorinPhoto }],
      npcs: [npc({ id: 'bianca', name: 'Bianca', portrait: npcPhoto })],
    });
    expect(photoFiles(exported).map(({ ref, variant }) => bundlePhotoPath(ref, variant))).toEqual([
      'game-images/character/thorin/img_t.webp',
      'game-images/character/thorin/img_t.thumb.webp',
      'game-images/npc/bianca/img_b.jpeg',
      'game-images/npc/bianca/img_b.thumb.jpeg',
    ]);

    // Export, as SaveControls does: the files come straight from the bundle paths here.
    const files = new Map(
      photoFiles(exported).map(({ ref, variant }) => [
        bundlePhotoPath(ref, variant),
        bytesOf(`${ref.imageId}-${variant}`),
      ]),
    );
    const bundle = readBundle(bundleSave(serializeSave(exported, archive), files));
    if (!bundle.ok) throw new Error(bundle.error);
    const parsed = parseSave(bundle.saveText, testCatalog);
    if (!parsed.ok) throw new Error(parsed.error);

    // Import into a browser whose game had another photo.
    const table = memoryBlobTable();
    const images = new GameImages(new LocalImageStore(table));
    const storage = memoryStorage();
    const before = makeState({
      characters: [
        {
          id: 'thorin',
          name: 'Thorin',
          color: '#aa5500',
          portrait: 'upload:character/thorin/img_old.webp',
        },
      ],
    });
    storage.setItem(STORAGE_KEY, serializeSave(before, archive));
    await table.put('character/thorin/img_old.webp', new Blob(['old']));
    await table.put('character/thorin/img_old.thumb.webp', new Blob(['old']));
    const store = await GameStore.open(
      testCatalog,
      new LocalRepository(storage, testCatalog),
      {
        contextFor: () => ({ actor: { role: 'master' } }),
        onRefused: () => undefined,
        onPersistError: (error) => {
          throw error;
        },
      },
      images,
    );

    await images.restore(parsed.state, (ref, variant) => {
      const data = bundle.files.get(bundlePhotoPath(ref, variant));
      return data && new Blob([data.slice()]);
    });
    store.replace(parsed.state);
    await store.whenSynced();
    await Promise.resolve();

    expect(table.keys().sort()).toEqual([
      'character/thorin/img_t.thumb.webp',
      'character/thorin/img_t.webp',
      'npc/bianca/img_b.jpeg',
      'npc/bianca/img_b.thumb.jpeg',
    ]);
    const thumb = await images.read(
      { target: { kind: 'npc', id: 'bianca' }, imageId: 'img_b', format: 'jpeg' },
      'thumb',
    );
    expect(await thumb?.text()).toBe('img_b-thumb');
  });

  it('keeps reading old JSON saves without images', () => {
    const text = serializeSave(makeState(), { topics: [], notes: [] });
    expect(isZip(bytesOf(text))).toBe(false);
    expect(parseSaveArchive(text)).toEqual({ ok: true, archive: { topics: [], notes: [] } });
  });
});
