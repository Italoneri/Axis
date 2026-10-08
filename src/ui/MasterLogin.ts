import { t } from '../i18n/pt-BR';
import { el } from './dom';
import type { MasterSession } from './MasterSession';

/** Native <dialog> asking for the master password; resolves to whether it unlocked. */
export function askMasterPassword(session: MasterSession): Promise<boolean> {
  return new Promise((resolve) => {
    const input = el('input', {
      class: 'input input--wide',
      type: 'password',
      autocomplete: 'current-password',
      required: true,
    });
    const error = el('p', { class: 'reasons', hidden: true }, t.master.wrongPassword);
    const dialog = el('dialog', { class: 'dialog' });
    let unlocked = false;

    const form = el(
      'form',
      {
        onsubmit: (event: Event) => {
          event.preventDefault();
          unlocked = session.unlock(input.value);
          if (unlocked) dialog.close();
          else {
            error.hidden = false;
            input.select();
          }
        },
      },
      el('h2', { class: 'panel__title' }, t.master.title),
      el('label', { class: 'field' }, t.master.password, input),
      error,
      el(
        'div',
        { class: 'row row--end' },
        el(
          'button',
          { class: 'btn', type: 'button', onclick: () => dialog.close() },
          t.master.cancel,
        ),
        el('button', { class: 'btn btn--primary', type: 'submit' }, t.master.unlock),
      ),
    );

    dialog.append(form);
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(unlocked);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}
