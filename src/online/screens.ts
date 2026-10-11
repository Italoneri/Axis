import { t } from '../i18n/pt-BR';
import { el } from '../ui/dom';

// Full-screen cards shown before the game starts online: login, loading and
// "create a game". They cover the map, which is not mounted yet.

function gate(...children: Node[]): void {
  const existing = document.getElementById('gate');
  const card = el(
    'section',
    { class: 'gate__card' },
    el('h1', { class: 'gate__title' }, t.online.title),
    ...children,
  );
  if (existing) existing.replaceChildren(card);
  else document.body.append(el('div', { id: 'gate', class: 'gate' }, card));
}

export function hideGate(): void {
  document.getElementById('gate')?.remove();
}

export function showMessage(text: string, tone?: 'error'): void {
  gate(el('p', { class: tone === 'error' ? 'gate__text reasons' : 'gate__text' }, text));
}

export function showLogin(sendLink: (email: string) => Promise<boolean>): void {
  const email = el('input', {
    class: 'input input--wide',
    type: 'email',
    autocomplete: 'email',
    required: true,
  });
  const status = el('p', { class: 'gate__text', 'aria-live': 'polite' });
  const submit = el('button', { class: 'btn btn--primary', type: 'submit' }, t.online.sendLink);
  const form = el(
    'form',
    {
      class: 'gate__form',
      onsubmit: async (event: Event) => {
        event.preventDefault();
        submit.disabled = true;
        const sent = await sendLink(email.value.trim());
        status.textContent = sent ? t.online.linkSent(email.value.trim()) : t.online.loginFailed;
        submit.disabled = sent;
      },
    },
    el('p', { class: 'gate__text' }, t.online.loginHint),
    el('label', { class: 'field' }, t.online.email, email),
    submit,
    status,
  );
  gate(form);
}

/** `create` returns an error message to show, or null when it navigates away. */
export function showCreateGame(
  create: (name: string, saveText: string | null) => Promise<string | null>,
): void {
  const name = el('input', {
    class: 'input input--wide',
    value: t.online.defaultGameName,
    maxlength: '80',
    required: true,
  });
  const file = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  const error = el('p', { class: 'gate__text reasons', 'aria-live': 'polite' });
  const run = async (saveText: string | null) => {
    error.textContent = (await create(name.value.trim(), saveText)) ?? '';
  };
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (chosen) await run(await chosen.text());
  });
  gate(
    el('p', { class: 'gate__text' }, t.online.noGameHint),
    el('label', { class: 'field' }, t.online.gameName, name),
    el(
      'div',
      { class: 'row row--wrap' },
      el(
        'button',
        { class: 'btn btn--primary', type: 'button', onclick: () => run(null) },
        t.online.createFromSeed,
      ),
      el(
        'button',
        { class: 'btn', type: 'button', onclick: () => file.click() },
        t.online.createFromSave,
      ),
    ),
    file,
    error,
  );
}
