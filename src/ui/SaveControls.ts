import { t } from '../i18n/pt-BR';
import { parseSave, serializeState } from '../systems/SaveSystem';
import type { GameStore } from '../store';
import { el } from './dom';
import { downloadText } from './download';

export function createSaveControls(
  store: GameStore,
  notify: (msg: string, tone?: 'error') => void,
): HTMLElement {
  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const parsed = parseSave(await file.text(), store.catalog);
    if (!parsed.ok) {
      notify(t.save.invalid(parsed.error), 'error');
      return;
    }
    if (!window.confirm(t.save.confirmImport)) return;
    store.replace(parsed.state);
    notify(t.save.imported);
  });

  const exportSave = () =>
    downloadText(`axis-save-dia-${store.current.day}.json`, serializeState(store.current));

  return el(
    'div',
    { class: 'topbar__actions' },
    el('button', { class: 'btn', type: 'button', onclick: exportSave }, t.save.export),
    el('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, t.save.import),
    fileInput,
  );
}
