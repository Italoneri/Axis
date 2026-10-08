import { t } from '../i18n/pt-BR';
import { parseSave, serializeState } from '../systems/SaveSystem';
import type { GameStore } from '../store';
import { el } from './dom';

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

  const exportSave = () => {
    const blob = new Blob([serializeState(store.current)], { type: 'application/json' });
    const link = el('a', {
      href: URL.createObjectURL(blob),
      download: `axis-save-dia-${store.current.day}.json`,
    });
    link.click();
    // Revoking synchronously can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  return el(
    'div',
    { class: 'topbar__actions' },
    el('button', { class: 'btn', type: 'button', onclick: exportSave }, t.save.export),
    el('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, t.save.import),
    fileInput,
  );
}
