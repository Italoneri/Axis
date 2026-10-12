import { t } from '../i18n/pt-BR';
import { el } from '../ui/dom';
import { button } from '../ui/widgets';

type Notify = (message: string, tone?: 'error') => void;

/** A link just made, shown once (only its hash is stored), with "Copiar link". */
export function linkBox(label: string, url: string, copy: (url: string) => void): HTMLElement {
  const input = el('input', { class: 'input input--wide', value: url, readonly: true });
  input.addEventListener('focus', () => input.select());
  return el(
    'div',
    { class: 'subform' },
    el('p', {}, label),
    input,
    button(t.invites.copy, () => copy(url), { primary: true }),
  );
}

export async function copyLink(url: string, notify: Notify): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    notify(t.invites.copied);
  } catch (error) {
    console.warn('[links] clipboard', error);
    notify(t.invites.copyFailed, 'error');
  }
}
