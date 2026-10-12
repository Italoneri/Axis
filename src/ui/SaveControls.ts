import type { ArchiveStore, ImageFileSource } from '../archiveStore';
import { t } from '../i18n/pt-BR';
import { imageMime } from '../persistence/ArchiveImageStore';
import {
  archiveImageFiles,
  bundleImagePath,
  bundleSave,
  hasArchiveImages,
  isZip,
  readBundle,
} from '../systems/SaveBundle';
import { parseSave, parseSaveArchive, serializeSave } from '../systems/SaveSystem';
import type { GameStore } from '../store';
import { el } from './dom';
import { downloadBlob, downloadText } from './download';

type Notify = (msg: string, tone?: 'error') => void;

/**
 * Export/import of the game; the Arquivo de registros travels in the same
 * file. With archive images the save is a .zip (save.json plus the images).
 */
export function createSaveControls(
  store: GameStore,
  archive: ArchiveStore,
  notify: Notify,
): HTMLElement {
  const fileInput = el('input', {
    type: 'file',
    accept: 'application/json,.json,application/zip,.zip',
    hidden: true,
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void importSave(file, store, archive, notify);
  });

  return el(
    'div',
    { class: 'topbar__actions' },
    el(
      'button',
      { class: 'btn', type: 'button', onclick: () => void exportSave(store, archive, notify) },
      t.save.export,
    ),
    el('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, t.save.import),
    fileInput,
  );
}

async function exportSave(store: GameStore, archive: ArchiveStore, notify: Notify): Promise<void> {
  const text = serializeSave(store.current, archive.stored);
  const name = `axis-save-dia-${store.current.day}`;
  if (!hasArchiveImages(archive.stored)) return downloadText(`${name}.json`, text);

  const files = new Map<string, Uint8Array>();
  let missing = 0;
  for (const { ref, variant } of archiveImageFiles(archive.stored)) {
    const blob = await archive.readImage(ref.noteId, ref.image, variant).catch((error: unknown) => {
      console.warn('[save] could not read an archive image', error);
      return null;
    });
    if (blob) files.set(bundleImagePath(ref, variant), new Uint8Array(await blob.arrayBuffer()));
    else missing += 1;
  }
  downloadBlob(`${name}.zip`, new Blob([bundleSave(text, files)], { type: 'application/zip' }));
  if (missing > 0) notify(t.save.imagesMissing(missing), 'error');
}

async function importSave(
  file: File,
  store: GameStore,
  archive: ArchiveStore,
  notify: Notify,
): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const bundle = isZip(bytes)
    ? readBundle(bytes)
    : {
        ok: true as const,
        saveText: new TextDecoder().decode(bytes),
        files: new Map<string, Uint8Array>(),
      };
  if (!bundle.ok) return notify(t.save.invalid(bundle.error), 'error');

  const parsed = parseSave(bundle.saveText, store.catalog);
  const records = parseSaveArchive(bundle.saveText);
  if (!parsed.ok) return notify(t.save.invalid(parsed.error), 'error');
  if (!records.ok) return notify(t.save.invalid(records.error), 'error');
  if (!window.confirm(t.save.confirmImport)) return;
  store.replace(parsed.state);
  const imageFiles: ImageFileSource = (ref, variant) => {
    const data = bundle.files.get(bundleImagePath(ref, variant));
    return data && new Blob([data.slice()], { type: imageMime(ref.image.format) });
  };
  if (records.archive) void archive.replace(records.archive, imageFiles);
  notify(t.save.imported);
}
