import { describe, expect, it } from 'vitest';
import { LocalImageStore, memoryBlobTable } from './LocalImageStore';

const ref = { noteId: 'zolt', image: { id: 'mapa', format: 'webp' as const } };
const files = { full: new Blob(['full']), thumb: new Blob(['thumb']) };

function fakeUrls() {
  const revoked: string[] = [];
  let next = 0;
  return {
    revoked,
    urls: {
      create: () => `blob:${++next}`,
      revoke: (url: string) => void revoked.push(url),
    },
  };
}

describe('LocalImageStore', () => {
  it('keeps the image and its thumbnail under the note', async () => {
    const table = memoryBlobTable();
    const store = new LocalImageStore(table, fakeUrls().urls);
    await store.put(ref, files);
    expect(table.keys()).toEqual(['zolt/mapa.webp', 'zolt/mapa.thumb.webp']);
    expect(await (await store.read(ref, 'thumb'))?.text()).toBe('thumb');
  });

  it('reuses one object URL per file and revokes it when the file goes', async () => {
    const { urls, revoked } = fakeUrls();
    const table = memoryBlobTable();
    const store = new LocalImageStore(table, urls);
    await store.put(ref, files);
    const first = await store.url(ref, 'full');
    expect(await store.url(ref, 'full')).toBe(first);

    await store.remove([ref]);
    expect(table.keys()).toEqual([]);
    expect(revoked).toEqual([first]);
    expect(await store.read(ref, 'full')).toBeNull();
    await expect(store.url(ref, 'full')).rejects.toThrow(/missing/);
  });
});
