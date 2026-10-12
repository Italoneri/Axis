import {
  IMAGE_VARIANTS,
  imagePath,
  type ArchiveImageStore,
  type ImageFiles,
  type ImageRef,
  type ImageVariant,
} from './ArchiveImageStore';

export const IMAGE_DB_NAME = 'axis-base-builder:archive-images';
/** The photos sent in game keep their own database, beside the archive's. */
export const PHOTO_DB_NAME = 'axis-base-builder:game-images';
const OBJECT_STORE = 'files';

/** The few operations the offline image store needs from IndexedDB; in memory for tests. */
export interface BlobTable {
  get(key: string): Promise<Blob | undefined>;
  put(key: string, blob: Blob): Promise<void>;
  delete(keys: readonly string[]): Promise<void>;
}

export interface ObjectUrls {
  create(blob: Blob): string;
  revoke(url: string): void;
}

const browserUrls: ObjectUrls = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
};

/**
 * Offline image files, one IndexedDB per browser beside the localStorage
 * archive (which cannot hold images). Object URLs are kept until the file goes.
 */
export class LocalImageStore implements ArchiveImageStore {
  private readonly urls = new Map<string, string>();

  constructor(
    private readonly table: BlobTable,
    private readonly objectUrls: ObjectUrls = browserUrls,
  ) {}

  async put(ref: ImageRef, files: ImageFiles): Promise<void> {
    await this.table.put(imagePath(ref, 'full'), files.full);
    await this.table.put(imagePath(ref, 'thumb'), files.thumb);
  }

  async url(ref: ImageRef, variant: ImageVariant): Promise<string> {
    const key = imagePath(ref, variant);
    const cached = this.urls.get(key);
    if (cached) return cached;
    const blob = await this.table.get(key);
    if (!blob) throw new Error(`archive image missing: ${key}`);
    const url = this.objectUrls.create(blob);
    this.urls.set(key, url);
    return url;
  }

  async read(ref: ImageRef, variant: ImageVariant): Promise<Blob | null> {
    return (await this.table.get(imagePath(ref, variant))) ?? null;
  }

  async remove(refs: readonly ImageRef[]): Promise<void> {
    const keys = refs.flatMap((ref) => IMAGE_VARIANTS.map((variant) => imagePath(ref, variant)));
    await this.table.delete(keys);
    for (const key of keys) {
      const url = this.urls.get(key);
      if (url) this.objectUrls.revoke(url);
      this.urls.delete(key);
    }
  }
}

export function memoryBlobTable(): BlobTable & { keys(): string[] } {
  const blobs = new Map<string, Blob>();
  return {
    get: (key) => Promise.resolve(blobs.get(key)),
    put: (key, blob) => {
      blobs.set(key, blob);
      return Promise.resolve();
    },
    delete: (keys) => {
      keys.forEach((key) => blobs.delete(key));
      return Promise.resolve();
    },
    keys: () => [...blobs.keys()],
  };
}

/** IndexedDB with a single object store keyed by the image path. */
export function indexedDbBlobTable(name = IMAGE_DB_NAME): BlobTable {
  let opened: Promise<IDBDatabase> | null = null;
  const database = () => (opened ??= openDatabase(name));
  const run = async <T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T> | undefined,
  ): Promise<T | undefined> => {
    const transaction = (await database()).transaction(OBJECT_STORE, mode);
    const request = work(transaction.objectStore(OBJECT_STORE));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('archive images: write'));
      transaction.onabort = () => reject(transaction.error ?? new Error('archive images: aborted'));
    });
    return request ? request.result : undefined;
  };
  return {
    get: async (key) => {
      const value = await run<unknown>('readonly', (store) => store.get(key));
      return value instanceof Blob ? value : undefined;
    },
    put: async (key, blob) => {
      await run('readwrite', (store) => {
        store.put(blob, key);
        return undefined;
      });
    },
    delete: async (keys) => {
      if (keys.length === 0) return;
      await run('readwrite', (store) => {
        keys.forEach((key) => store.delete(key));
        return undefined;
      });
    },
  };
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(OBJECT_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('archive images: open'));
    request.onblocked = () => reject(new Error('archive images: database blocked by another tab'));
  });
}
