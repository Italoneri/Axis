import { describe, expect, it } from 'vitest';
import { SIGNED_URL_SECONDS, SupabaseImageStore, type ImageBucket } from './SupabaseImageStore';

const ref = { noteId: 'mapa', image: { id: 'portao', format: 'webp' as const } };

function fakeBucket() {
  const calls: string[] = [];
  let signed = 0;
  const bucket: ImageBucket = {
    upload: (path, _blob, type) => {
      calls.push(`upload ${path} ${type}`);
      return Promise.resolve();
    },
    signedUrl: (path) => Promise.resolve(`https://storage/${path}?token=${++signed}`),
    download: (path) => Promise.resolve(path.endsWith('.thumb.webp') ? new Blob(['t']) : null),
    remove: (paths) => {
      calls.push(`remove ${paths.join(',')}`);
      return Promise.resolve();
    },
  };
  return { bucket, calls };
}

describe('SupabaseImageStore', () => {
  it('stores both files under the game and the note', async () => {
    const { bucket, calls } = fakeBucket();
    await new SupabaseImageStore(bucket, 'game').put(ref, {
      full: new Blob(['f']),
      thumb: new Blob(['t']),
    });
    expect(calls).toEqual([
      'upload game/mapa/portao.webp image/webp',
      'upload game/mapa/portao.thumb.webp image/webp',
    ]);
  });

  it('reuses a signed URL until shortly before it expires', async () => {
    let now = 0;
    const store = new SupabaseImageStore(fakeBucket().bucket, 'game', () => now);
    const first = await store.url(ref, 'thumb');
    now = (SIGNED_URL_SECONDS - 120) * 1000;
    expect(await store.url(ref, 'thumb')).toBe(first);
    now = (SIGNED_URL_SECONDS - 30) * 1000;
    expect(await store.url(ref, 'thumb')).not.toBe(first);
  });

  it('reads missing files as null and removes both variants', async () => {
    const { bucket, calls } = fakeBucket();
    const store = new SupabaseImageStore(bucket, 'game');
    expect(await store.read(ref, 'full')).toBeNull();
    expect(await store.read(ref, 'thumb')).not.toBeNull();
    await store.remove([ref]);
    expect(calls).toEqual(['remove game/mapa/portao.webp,game/mapa/portao.thumb.webp']);
  });
});
