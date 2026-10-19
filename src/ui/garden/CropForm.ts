import { t } from '../../i18n/pt-BR';
import type { Catalog } from '../../model/catalog';
import {
  plotTypeSchema,
  type Crop,
  type CropLook,
  type GameState,
  type PlotType,
} from '../../model/schema';
import type { CoinBag } from '../../systems/Coins';
import { el } from '../dom';
import { priceInputs } from '../shop/ShopItemForm';
import { button, closeButton, field, keepEscapeInside, numberInput } from '../widgets';
import { cropSprite, pottedPlant } from './GardenScene';
import { cropLook } from './sceneLayout';

const DAYS_RANGE = { min: 1, max: 365 } as const;
const YIELD_RANGE = { min: 1, max: 9999 } as const;

export interface CropDraft {
  seedId: string;
  harvestId: string;
  plotType: PlotType;
  days: number;
  yield: number;
  rare: boolean;
  price: CoinBag;
  /** Undefined: automatic. */
  look: CropLook | undefined;
}

export type CropFormResult =
  { ok: true; crop: Crop } | { ok: false; reason: 'missing_material' | 'empty_price' };

/** A rare crop has no price, so whatever is typed there is dropped. */
export function cropFormValues(form: CropDraft): CropFormResult {
  if (form.seedId === '' || form.harvestId === '') return { ok: false, reason: 'missing_material' };
  const { seedId, harvestId, plotType, days, yield: quantity, look } = form;
  const base = { seedId, harvestId, plotType, days, yield: quantity, ...(look ? { look } : {}) };
  if (form.rare) return { ok: true, crop: { ...base, rare: true } };
  const hasPrice = Object.values(form.price).some((amount) => amount > 0);
  if (!hasPrice) return { ok: false, reason: 'empty_price' };
  return { ok: true, crop: { ...base, rare: false, price: form.price } };
}

export type LookMode = 'auto' | CropLook['kind'];

const LOOK_MODES = ['auto', 'foliage', 'flower'] as const satisfies readonly LookMode[];

type FlowerColor = keyof typeof t.garden.crops.look.colors;

/** Turns of flower3 that bring its pink petals to each color (measured on the sprite). */
const FLOWER_COLORS: readonly { id: FlowerColor; hue: number }[] = [
  { id: 'rosa', hue: 0 },
  { id: 'vermelho', hue: 45 },
  { id: 'laranja', hue: 75 },
  { id: 'amarelo', hue: 105 },
  { id: 'verde', hue: 160 },
  { id: 'ciano', hue: -130 },
  { id: 'azul', hue: -85 },
  { id: 'anil', hue: -55 },
  { id: 'violeta', hue: -30 },
];

/** `auto` keeps no look, so the garden goes on drawing one from the seed id. Foliage has no color. */
export function chosenLook(mode: LookMode, hue: number): CropLook | undefined {
  if (mode === 'auto') return undefined;
  return mode === 'flower' ? { kind: 'flower', hue } : { kind: 'foliage', hue: 0 };
}

function isWithin(value: number, { min, max }: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

export interface CropFormOptions {
  state: GameState;
  catalog: Catalog;
  /** Present when editing; its seed is the crop's identity and cannot change. */
  crop?: Crop;
  /** Saves the crop and returns whether it now exists. */
  save(crop: Crop): boolean;
}

/** Modal form of a crop. It closes when `save` accepts the crop. */
export function openCropForm({ state, catalog, crop, save }: CropFormOptions): void {
  const texts = t.garden.crops;
  const taken = new Set(state.garden.crops.map((existing) => existing.seedId));
  const freeSeeds = state.materials.items.filter(
    (material) => material.id === crop?.seedId || !taken.has(material.id),
  );

  const seed = materialSelect(texts.seed, state, freeSeeds, crop?.seedId ?? '');
  seed.disabled = crop !== undefined;
  const harvest = materialSelect(
    texts.harvest,
    state,
    state.materials.items,
    crop?.harvestId ?? '',
  );
  const plotType = el(
    'select',
    { class: 'input', 'aria-label': texts.plotType },
    ...plotTypeSchema.options.map((type) =>
      el(
        'option',
        { value: type, selected: type === (crop?.plotType ?? 'canteiro') },
        texts.plotTypes[type],
      ),
    ),
  );
  const days = numberInput({ ...DAYS_RANGE, value: crop?.days ?? 1, label: texts.days });
  const quantity = numberInput({ ...YIELD_RANGE, value: crop?.yield ?? 1, label: texts.yield });
  const rare = el('input', { type: 'checkbox', checked: crop?.rare ?? false });
  const prices = priceInputs(catalog, crop && !crop.rare ? crop.price : undefined);
  const look = lookPicker(seed, crop?.look);
  const pricePart = el('div', { class: 'field' }, el('span', {}, texts.price), prices.element);
  const noSeeds = el('p', { class: 'panel__hint' }, texts.noSeeds);
  const submitButton = el('button', { class: 'btn btn--primary', type: 'submit' }, texts.save);

  const read = () =>
    cropFormValues({
      seedId: seed.value,
      harvestId: harvest.value,
      plotType: parsePlotType(plotType.value),
      days: Number(days.value),
      yield: Number(quantity.value),
      rare: rare.checked,
      price: prices.read(),
      look: look.read(),
    });
  const sync = () => {
    pricePart.hidden = rare.checked;
    noSeeds.hidden = freeSeeds.length > 0;
    submitButton.disabled =
      !read().ok ||
      !isWithin(Number(days.value), DAYS_RANGE) ||
      !isWithin(Number(quantity.value), YIELD_RANGE);
  };
  for (const control of [seed, harvest, plotType, days, quantity, rare]) {
    control.addEventListener('input', sync);
  }
  prices.element.addEventListener('input', sync);

  const dialog = el(
    'dialog',
    { class: 'dialog dialog--shop-confirm', 'aria-label': crop ? texts.editTitle : texts.newTitle },
    el(
      'header',
      { class: 'menu__header' },
      el('h2', { class: 'panel__title' }, crop ? texts.editTitle : texts.newTitle),
      closeButton(texts.close, () => dialog.close()),
    ),
    el(
      'form',
      {
        class: 'shop-confirm__body',
        onsubmit: (event: Event) => {
          event.preventDefault();
          const result = read();
          if (result.ok && save(result.crop)) dialog.close();
        },
      },
      field(texts.seed, seed),
      noSeeds,
      field(texts.harvest, harvest),
      field(texts.plotType, plotType),
      field(texts.days, days),
      field(texts.yield, quantity),
      el('label', { class: 'row' }, rare, texts.rare),
      pricePart,
      look.element,
      el(
        'div',
        { class: 'row row--end' },
        button(texts.cancel, () => dialog.close()),
        submitButton,
      ),
    ),
  );
  keepEscapeInside(dialog);
  sync();
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

interface LookPicker {
  element: HTMLElement;
  read: () => CropLook | undefined;
}

/**
 * "Aparência": automatic, foliage or a flower of a chosen color, with the
 * icon and a ripe plant as the garden draws them. The automatic preview
 * follows the seed picked above.
 */
function lookPicker(seed: HTMLSelectElement, initial: CropLook | undefined): LookPicker {
  const texts = t.garden.crops.look;
  let mode: LookMode = initial?.kind ?? 'auto';
  // Starting from the drawn hue keeps the flower's color when "Flor" is picked.
  let hue = initial?.hue ?? cropLook({ seedId: seed.value }).hue;
  const modes = LOOK_MODES.map((value) => ({
    value,
    input: el('input', { type: 'radio', name: 'crop-look-kind', value, checked: value === mode }),
  }));
  const swatches = FLOWER_COLORS.map((color) => ({
    color,
    node: el(
      'button',
      {
        class: 'crop-look__swatch',
        type: 'button',
        'aria-label': texts.colors[color.id],
        title: texts.colors[color.id],
      },
      cropSprite({ kind: 'flower', hue: color.hue }),
    ),
  }));
  const range = el('input', {
    class: 'crop-look__range',
    type: 'range',
    min: '-180',
    max: '180',
    step: '1',
    'aria-label': texts.fineTune,
  });
  const hint = el('p', { class: 'panel__hint' }, texts.autoHint);
  const preview = el('div', {
    class: 'crop-look__preview',
    role: 'img',
    'aria-label': texts.preview,
  });

  const render = () => {
    const isFlower = mode === 'flower';
    swatches.forEach(({ color, node }) => {
      node.disabled = !isFlower;
      node.setAttribute('aria-pressed', String(isFlower && color.hue === hue));
    });
    range.disabled = !isFlower;
    range.value = String(hue);
    hint.hidden = mode !== 'auto';
    const shown = chosenLook(mode, hue) ?? cropLook({ seedId: seed.value });
    preview.replaceChildren(cropSprite(shown), pottedPlant(shown));
  };
  modes.forEach(({ value, input }) =>
    input.addEventListener('change', () => {
      mode = value;
      render();
    }),
  );
  swatches.forEach(({ color, node }) =>
    node.addEventListener('click', () => {
      hue = color.hue;
      render();
    }),
  );
  range.addEventListener('input', () => {
    hue = Number(range.value);
    render();
  });
  seed.addEventListener('input', render);
  render();

  const element = el(
    'fieldset',
    { class: 'crop-look' },
    el('legend', { class: 'crop-look__title' }, texts.title),
    el(
      'div',
      { class: 'row row--wrap', role: 'radiogroup', 'aria-label': texts.kind },
      ...modes.map(({ value, input }) => el('label', { class: 'row' }, input, texts.kinds[value])),
    ),
    hint,
    el(
      'div',
      { class: 'field' },
      el('span', {}, texts.color),
      el(
        'div',
        { class: 'crop-look__swatches', role: 'group', 'aria-label': texts.color },
        ...swatches.map(({ node }) => node),
      ),
      range,
    ),
    preview,
  );
  return { element, read: () => chosenLook(mode, hue) };
}

/** Materials grouped by category, so "Sementes" and "Ervas" stand out. */
export function materialSelect(
  label: string,
  state: GameState,
  materials: GameState['materials']['items'],
  value: string,
): HTMLSelectElement {
  const option = (material: { id: string; name: string }) =>
    el('option', { value: material.id, selected: material.id === value }, material.name);
  const groups = state.materials.categories.flatMap((category) => {
    const members = materials.filter((material) => material.category === category.id);
    return members.length === 0
      ? []
      : [el('optgroup', { label: category.name }, ...members.map(option))];
  });
  const known = new Set(state.materials.categories.map((category) => category.id));
  const orphans = materials.filter((material) => !known.has(material.category));
  return el(
    'select',
    { class: 'input', 'aria-label': label },
    el('option', { value: '', selected: value === '' }, '—'),
    ...groups,
    ...(orphans.length > 0
      ? [el('optgroup', { label: t.garden.crops.uncategorized }, ...orphans.map(option))]
      : []),
  );
}

function parsePlotType(value: string): PlotType {
  return plotTypeSchema.safeParse(value).data ?? 'canteiro';
}
