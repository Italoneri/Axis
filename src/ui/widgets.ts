import { t } from '../i18n/pt-BR';
import { resolveImage, type Catalog } from '../model/catalog';
import type { GameCommand } from '../commands/schema';
import type { Category } from '../model/schema';
import type { CoinBag } from '../systems/Coins';
import { looksLikeUpload } from '../systems/GameImages';
import type { GameImages } from '../gameImages';
import type { GameStore } from '../store';
import { el } from './dom';
import type { MasterAccess } from './MasterSession';
import type { UiMemory } from './uiMemory';

// Small building blocks shared by the resource panels, the slot panel and the master tools.

/** Dispatches a command (the store reports refusals); true when it went through. */
export type Act = (command: GameCommand) => boolean;

/** What every resource panel needs; bundled to keep constructors short. */
export interface PanelDeps {
  store: GameStore;
  session: MasterAccess;
  act: Act;
  memory: UiMemory;
}

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

/**
 * Where thumbnails find their pictures: asset keys and URLs in the catalog,
 * photos sent in game in `images` (a GameStore has both).
 */
export interface ImageSource {
  catalog: Catalog;
  images?: GameImages;
}

export type ThumbSize = 'sm' | 'md' | 'lg';

export interface ThumbSubject {
  image?: string | undefined;
  name: string;
  color?: string | undefined;
  /** Asset key shown instead of the initial when there is no picture. */
  fallback?: string;
}

/**
 * Image from an asset key, a URL or a photo sent in game, or a placeholder
 * (also while a photo loads, or if it is gone): the `fallback` icon when it
 * resolves, otherwise a colored circle with the initial.
 */
export function thumb(
  source: ImageSource,
  { image, name, color, fallback }: ThumbSubject,
  size: ThumbSize = 'sm',
): HTMLElement {
  const className = `thumb thumb--${size}`;
  const fallbackSrc = resolveImage(source.catalog, fallback);
  const placeholder = () =>
    fallbackSrc
      ? el('img', { class: `${className} thumb--fallback`, src: fallbackSrc, alt: '' })
      : el(
          'span',
          {
            class: `${className} thumb--placeholder`,
            style: color ? `--thumb-color: ${color}` : undefined,
            'aria-hidden': 'true',
          },
          name.trim().charAt(0).toUpperCase() || '?',
        );
  return pictureOr(source, image, className, placeholder);
}

/**
 * <img> of an asset key, a URL or a photo sent in game; the node `placeholder`
 * builds stands in when there is none, while a photo loads, or if it is gone.
 */
export function pictureOr(
  { catalog, images }: ImageSource,
  image: string | undefined,
  className: string,
  placeholder: () => HTMLElement,
): HTMLElement {
  if (looksLikeUpload(image)) {
    return images ? uploadedThumb(images, image, className, placeholder()) : placeholder();
  }
  const src = resolveImage(catalog, image);
  if (src) return el('img', { class: className, src, alt: '' });
  return placeholder();
}

/**
 * Shows the placeholder until the photo loads, unless its URL is already
 * known (a redraw). A failed load asks for a fresh URL once: a signed one may
 * have expired.
 */
function uploadedThumb(
  images: GameImages,
  ref: string,
  className: string,
  placeholder: HTMLElement,
): HTMLElement {
  const picture = el('img', { class: className, alt: '', decoding: 'async' });
  const known = images.peek(ref, 'thumb');
  let shown: HTMLElement = known ? picture : placeholder;
  let retried = false;
  const swap = (next: HTMLElement) => {
    if (shown === next) return;
    shown.replaceWith(next);
    shown = next;
  };
  const fetchUrl = () =>
    images.url(ref, 'thumb').then(
      (url) => (picture.src = url),
      (error: unknown) => console.warn('[photos] photo unavailable', ref, error),
    );
  picture.addEventListener('load', () => swap(picture));
  picture.addEventListener('error', () => {
    swap(placeholder);
    if (retried) return;
    retried = true;
    void fetchUrl();
  });
  if (known) picture.src = known;
  else void fetchUrl();
  return shown;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function selectInput({
  label,
  options,
  value,
}: {
  label: string;
  options: readonly SelectOption[];
  value: string;
}): HTMLSelectElement {
  return el(
    'select',
    { class: 'input', 'aria-label': label },
    ...options.map((o) =>
      el(
        'option',
        { value: o.value, selected: o.value === value, disabled: o.disabled === true },
        o.label,
      ),
    ),
  );
}

/**
 * <select> that keeps the user's last choice across re-renders (and reloads),
 * falling back to `fallback` (or the first option) once that choice is gone.
 */
export function rememberedSelect(
  memory: UiMemory,
  {
    key,
    label,
    options,
    fallback,
  }: {
    key: string;
    label: string;
    options: readonly { value: string; label: string }[];
    fallback?: string;
  },
): HTMLSelectElement {
  const value = memory.pick(
    key,
    options.map((o) => o.value),
    fallback ?? options[0]?.value ?? '',
  );
  const node = selectInput({ label, options, value });
  node.addEventListener('change', () => memory.set(key, node.value));
  return node;
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
/** Two clicks to act; `prompt` replaces "Clique de novo para confirmar" between them. */
export function confirmButton(
  label: string,
  onConfirm: () => void,
  prompt: string = t.master.confirmRemove,
): HTMLButtonElement {
  let armedUntil = 0;
  const node = el('button', { class: 'btn btn--danger', type: 'button' }, label);
  node.addEventListener('click', () => {
    if (Date.now() < armedUntil) return onConfirm();
    armedUntil = Date.now() + CONFIRM_WINDOW_MS;
    node.textContent = prompt;
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
  return parseCount(input.value);
}

export function parseCount(text: string): number {
  const value = Math.floor(Number(text));
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
}

/** One number field per coin, optionally prefilled and capped at what a wallet holds. */
export function coinInputs(
  catalog: Catalog,
  {
    initial,
    max,
    onInput,
  }: { initial?: CoinBag; max?: CoinBag; onInput?: (coins: CoinBag) => void } = {},
): CoinInputs {
  const rows = catalog.currencies.map((currency) => {
    const cap = max ? (max[currency.id] ?? 0) : undefined;
    const value = initial?.[currency.id];
    const input = numberInput({ min: 0, max: cap, value, label: currency.name });
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
        thumb({ catalog }, { image: currency.icon, name: currency.name }),
        el('span', { class: 'row__name' }, currency.name),
        input,
      ),
    ),
  );
  if (onInput) element.addEventListener('input', () => onInput(read()));
  return { element, read };
}

export interface CategoryOps {
  add: (name: string) => GameCommand;
  rename: (id: string, name: string) => GameCommand;
  remove: (id: string) => GameCommand;
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

export function closeButton(label: string, onClose: () => void): HTMLElement {
  return el(
    'button',
    { class: 'btn btn--icon', type: 'button', 'aria-label': label, onclick: onClose },
    '×',
  );
}

/** Esc closes the dialog; the slot panel behind it should stay open. */
export function keepEscapeInside(dialog: HTMLDialogElement): void {
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') event.stopPropagation();
  });
}
