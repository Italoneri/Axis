import { t } from '../i18n/pt-BR';
import type { Catalog } from '../model/catalog';
import { el } from '../ui/dom';
import { thumb } from '../ui/widgets';

// Full-screen cards shown before the game starts online: login, loading,
// "Entrar na Axis" and "create a game". They cover the map, which is not mounted yet.

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

export interface LoginActions {
  /** Leaves the page for Google; false when it could not start. */
  google: () => Promise<boolean>;
  sendLink: (email: string) => Promise<boolean>;
}

/** Google first; the magic link stays as an alternative (it needs the project's own SMTP). */
export function showLogin({ google, sendLink }: LoginActions): void {
  const status = el('p', { class: 'gate__text', 'aria-live': 'polite' });
  const googleButton = el(
    'button',
    {
      class: 'btn btn--primary',
      type: 'button',
      onclick: async () => {
        googleButton.disabled = true;
        const started = await google();
        if (started) return;
        status.textContent = t.online.googleFailed;
        googleButton.disabled = false;
      },
    },
    t.online.google,
  );
  gate(
    el('p', { class: 'gate__text' }, t.online.loginHint),
    googleButton,
    status,
    el(
      'details',
      { class: 'gate__alternative' },
      el('summary', {}, t.online.emailToggle),
      emailForm(sendLink),
    ),
  );
}

function emailForm(sendLink: LoginActions['sendLink']): HTMLFormElement {
  const email = el('input', {
    class: 'input input--wide',
    type: 'email',
    autocomplete: 'email',
    required: true,
  });
  const status = el('p', { class: 'gate__text', 'aria-live': 'polite' });
  const submit = el('button', { class: 'btn', type: 'submit' }, t.online.sendLink);
  return el(
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
    el('p', { class: 'gate__hint' }, t.online.emailHint),
    el('label', { class: 'field' }, t.online.email, email),
    submit,
    status,
  );
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

export interface JoinPreview {
  gameId: string;
  gameName: string;
  isMember: boolean;
  /** Characters still without a player; uploaded portraits come as signed URLs. */
  characters: { id: string; name: string; color: string; portrait?: string | undefined }[];
}

export type JoinChoice =
  | { kind: 'claim'; characterId: string }
  | { kind: 'create'; name: string; color: string; portrait?: string | undefined };

/** Suggestions from the Google account for a new character. */
export interface JoinSuggestion {
  name: string;
  portrait?: string | undefined;
}

const DEFAULT_COLOR = '#6a8fd4';

/**
 * "Entrar na Axis": take a character nobody plays yet, or create one. `join`
 * returns an error message to show, or null when it navigates into the game.
 */
export function showJoinGame({
  preview,
  catalog,
  suggestion,
  join,
}: {
  preview: JoinPreview;
  catalog: Catalog;
  suggestion: JoinSuggestion;
  join: (choice: JoinChoice) => Promise<string | null>;
}): void {
  const error = el('p', { class: 'gate__text reasons', 'aria-live': 'polite' });
  const run = async (choice: JoinChoice, trigger: HTMLButtonElement) => {
    trigger.disabled = true;
    error.textContent = (await join(choice)) ?? '';
    trigger.disabled = false;
  };
  gate(
    el('h2', { class: 'gate__subtitle' }, t.online.joinTitle(preview.gameName)),
    el('p', { class: 'gate__text' }, t.online.joinHint),
    el('h3', { class: 'section-title' }, t.online.joinClaim),
    claimList(preview, catalog, run),
    el('h3', { class: 'section-title' }, t.online.joinCreate),
    createForm(catalog, suggestion, run),
    error,
  );
}

type RunChoice = (choice: JoinChoice, trigger: HTMLButtonElement) => Promise<void>;

function claimList(preview: JoinPreview, catalog: Catalog, run: RunChoice): HTMLElement {
  if (preview.characters.length === 0) {
    return el('p', { class: 'gate__text' }, t.online.joinNoFree);
  }
  return el(
    'ul',
    { class: 'join__characters', 'aria-label': t.online.joinClaimHint },
    ...preview.characters.map((character) => {
      const choose: HTMLButtonElement = el(
        'button',
        {
          class: 'btn join__character',
          type: 'button',
          onclick: () => void run({ kind: 'claim', characterId: character.id }, choose),
        },
        thumb({ catalog }, { image: character.portrait, ...character }, 'md'),
        el('span', {}, t.online.joinAs(character.name)),
      );
      return el('li', {}, choose);
    }),
  );
}

function createForm(catalog: Catalog, suggestion: JoinSuggestion, run: RunChoice): HTMLElement {
  const name = el('input', {
    class: 'input input--wide',
    value: suggestion.name,
    maxlength: '60',
    required: true,
  });
  const color = el('input', { class: 'input', type: 'color', value: DEFAULT_COLOR });
  const portrait = el('span', { class: 'join__portrait' });
  const drawPortrait = () =>
    portrait.replaceChildren(
      thumb(
        { catalog },
        { image: suggestion.portrait, name: name.value, color: color.value },
        'lg',
      ),
    );
  name.addEventListener('input', drawPortrait);
  color.addEventListener('input', drawPortrait);
  drawPortrait();
  const submit = el('button', { class: 'btn btn--primary', type: 'submit' }, t.online.joinSubmit);
  return el(
    'form',
    {
      class: 'gate__form',
      onsubmit: (event: Event) => {
        event.preventDefault();
        const choice: JoinChoice = {
          kind: 'create',
          name: name.value.trim(),
          color: color.value,
          portrait: suggestion.portrait,
        };
        void run(choice, submit);
      },
    },
    el(
      'div',
      { class: 'row row--wrap' },
      portrait,
      el('label', { class: 'field' }, t.online.joinColor, color),
    ),
    el('p', { class: 'gate__hint' }, t.online.joinPhotoHint),
    el('label', { class: 'field' }, t.online.joinName, name),
    submit,
  );
}
