import { t } from '../i18n/pt-BR';
import { resolveImage, type Catalog } from '../model/catalog';
import type { Category, GameState } from '../model/schema';
import type { CoinBag } from '../systems/Coins';
import type { Outcome } from '../systems/outcome';
import { el } from './dom';

// Small building blocks shared by the resource panels, the slot panel and the master tools.

/** Runs a store action and reports a refusal to the user; true when it went through. */
export type Act = (action: (state: GameState) => Outcome) => boolean;

const CONFIRM_WINDOW_MS = 3000;

export function section(title: string, ...children: (Node | false | null)[]): HTMLElement {
  return el('section', { class: 'card' }, el('h3', { class: 'section-title' }, title), ...children);
}

export function field(label: string, control: HTMLElement): HTMLLabelElement {
  return el('label', { class: 'field' }, label, control);
}

export function button(
  label: string,
  onclick: () => void,
  {
    primary = false,
    disabled = false,
    title,
  }: { primary?: boolean; disabled?: boolean; title?: string } = {},
): HTMLButtonElement {
  return el(
    'button',
    { class: primary ? 'btn btn--primary' : 'btn', type: 'button', disabled, title, onclick },
    label,
  );
}

/** Image from an asset key or URL, or a colored circle with the initial as placeholder. */
export function thumb(
  catalog: Catalog,
  { image, name, color }: { image?: string | undefined; name: string; color?: string | undefined },
  size: 'sm' | 'md' = 'sm',
): HTMLElement {
  const src = resolveImage(catalog, image);
  if (src) return el('img', { class: `thumb thumb--${size}`, src, alt: '' });
  return el(
    'span',
    {
      class: `thumb thumb--${size} thumb--placeholder`,
      style: color ? `--thumb-color: ${color}` : undefined,
      'aria-hidden': 'true',
    },
    name.trim().charAt(0).toUpperCase() || '?',
  );
}

export function progressBar(fraction: number, color?: string): HTMLElement {
  const clamped = Math.min(1, Math.max(0, fraction));
  return el(
    'div',
    { class: 'progress', role: 'progressbar', 'aria-valuenow': String(Math.round(clamped * 100)) },
    el('div', {
      class: 'progress__fill',
      style: `transform: scaleX(${clamped})${color ? `; background: ${color}` : ''}`,
    }),
  );
}

/** Two-step button: the first click arms it, a second click within a few seconds confirms. */
export function confirmButton(label: string, onConfirm: () => void): HTMLButtonElement {
  let armedUntil = 0;
  const node = el('button', { class: 'btn btn--danger', type: 'button' }, label);
  node.addEventListener('click', () => {
    if (Date.now() < armedUntil) return onConfirm();
    armedUntil = Date.now() + CONFIRM_WINDOW_MS;
    node.textContent = t.master.confirmRemove;
    setTimeout(() => (node.textContent = label), CONFIRM_WINDOW_MS);
  });
  return node;
}

export function numberInput({
  value,
  min,
  max,
  label,
}: {
  value?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
  label: string;
}): HTMLInputElement {
  return el('input', {
    class: 'input',
    type: 'number',
    inputmode: 'numeric',
    step: '1',
    min: min === undefined ? undefined : String(min),
    max: max === undefined ? undefined : String(max),
    value: value === undefined ? undefined : String(value),
    placeholder: '0',
    'aria-label': label,
  });
}

/** Whole, non-negative number typed in an input; blanks and garbage count as 0. */
export function readCount(input: HTMLInputElement): number {
  const value = Math.floor(Number(input.value));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** [−] [ 42 ] [+] for percentages and quantities; commits on every change. */
export function stepper(
  value: number,
  onChange: (next: number) => void,
  { step = 1, label }: { step?: number; label: string },
): HTMLElement {
  const input = el('input', {
    class: 'input input--narrow',
    type: 'number',
    inputmode: 'numeric',
    value: String(value),
    'aria-label': label,
  });
  input.addEventListener('change', () => onChange(Number(input.value)));
  return el(
    'div',
    { class: 'stepper' },
    el(
      'button',
      {
        class: 'btn',
        type: 'button',
        'aria-label': t.common.decrease,
        onclick: () => onChange(value - step),
      },
      '−',
    ),
    input,
    el(
      'button',
      {
        class: 'btn',
        type: 'button',
        'aria-label': t.common.increase,
        onclick: () => onChange(value + step),
      },
      '+',
    ),
  );
}

export interface CoinInputs {
  element: HTMLElement;
  read: () => CoinBag;
  clear: () => void;
}

/** One number field per coin, optionally capped at what a wallet holds. */
export function coinInputs(
  catalog: Catalog,
  { max, onInput }: { max?: CoinBag; onInput?: (coins: CoinBag) => void } = {},
): CoinInputs {
  const rows = catalog.currencies.map((currency) => {
    const cap = max ? (max[currency.id] ?? 0) : undefined;
    const input = numberInput({ min: 0, max: cap, label: currency.name });
    input.disabled = cap === 0;
    return { currency, input };
  });
  const read = (): CoinBag =>
    Object.fromEntries(
      rows.flatMap(({ currency, input }) => {
        const count = readCount(input);
        const cap = max ? (max[currency.id] ?? 0) : Infinity;
        return count > 0 ? [[currency.id, Math.min(count, cap)]] : [];
      }),
    );
  const element = el(
    'div',
    { class: 'coin-inputs' },
    ...rows.map(({ currency, input }) =>
      el(
        'label',
        { class: 'row' },
        thumb(catalog, { image: currency.icon, name: currency.name }),
        el('span', { class: 'row__name' }, currency.name),
        input,
      ),
    ),
  );
  if (onInput) element.addEventListener('input', () => onInput(read()));
  return { element, read, clear: () => rows.forEach(({ input }) => (input.value = '')) };
}

export interface CategoryOps {
  add: (name: string) => (state: GameState) => Outcome;
  rename: (id: string, name: string) => (state: GameState) => Outcome;
  remove: (id: string) => (state: GameState) => Outcome;
}

/** Master card to create categories and rename or remove the one being viewed. */
export function categoryManager(
  act: Act,
  {
    categories,
    currentId,
    isCurrentEmpty,
  }: { categories: readonly Category[]; currentId: string | null; isCurrentEmpty: boolean },
  ops: CategoryOps,
): HTMLElement {
  const current = categories.find((c) => c.id === currentId);
  const renameInput = el('input', {
    class: 'input input--wide',
    value: current?.name ?? '',
    'aria-label': t.categories.rename,
  });
  const newInput = el('input', {
    class: 'input input--wide',
    'aria-label': t.categories.newCategory,
  });
  return el(
    'section',
    { class: 'card card--master' },
    el('h3', { class: 'section-title' }, t.categories.title),
    current &&
      el(
        'div',
        { class: 'row row--wrap' },
        field(t.categories.rename, renameInput),
        button(t.common.save, () => act(ops.rename(current.id, renameInput.value))),
        isCurrentEmpty
          ? confirmButton(t.common.remove, () => act(ops.remove(current.id)))
          : button(t.common.remove, () => undefined, {
              disabled: true,
              title: t.categories.removeHint,
            }),
      ),
    el(
      'div',
      { class: 'row row--wrap' },
      field(t.categories.newCategory, newInput),
      button(t.common.create, () => act(ops.add(newInput.value)), { primary: true }),
    ),
  );
}
