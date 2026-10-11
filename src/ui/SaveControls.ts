import type { ArchiveStore } from '../archiveStore';
import { t } from '../i18n/pt-BR';
import { parseSave, parseSaveArchive, serializeSave } from '../systems/SaveSystem';
import type { GameStore } from '../store';
import { el } from './dom';
import { downloadText } from './download';

/** Export/import of the game; the Arquivo de registros travels in the same file. */
export function createSaveControls(
  store: GameStore,
  archive: ArchiveStore,
  notify: (msg: string, tone?: 'error') => void,
): HTMLElement {
  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const text = await file.text();
    const parsed = parseSave(text, store.catalog);
    const records = parseSaveArchive(text);
    if (!parsed.ok) return notify(t.save.invalid(parsed.error), 'error');
    if (!records.ok) return notify(t.save.invalid(records.error), 'error');
    if (!window.confirm(t.save.confirmImport)) return;
    store.replace(parsed.state);
    if (records.archive) void archive.replace(records.archive);
    notify(t.save.imported);
  });

  const exportSave = () =>
    downloadText(
      `axis-save-dia-${store.current.day}.json`,
      serializeSave(store.current, archive.stored),
    );

  return el(
    'div',
    { class: 'topbar__actions' },
    el('button', { class: 'btn', type: 'button', onclick: exportSave }, t.save.export),
    el('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, t.save.import),
    fileInput,
  );
}
