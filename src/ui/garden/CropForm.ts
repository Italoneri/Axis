import { t } from '../../i18n/pt-BR';
import type { Catalog } from '../../model/catalog';
import {
  plotTypeSchema,
  type Crop,
  type CropLook,
  type GameState,
  type PlotType,
  type StockRef,
} from '../../model/schema';
import type { CoinBag } from '../../systems/Coins';
import type { CropFields } from '../../systems/Garden';
import { parseRefKey, refKey } from '../../systems/Stock';
import { el } from '../dom';
import { priceInputs } from '../shop/ShopItemForm';
import { stockPicker, type DepotAccess } from '../stock/StockPicker';
import { button, closeButton, field, keepEscapeInside, numberInput } from '../widgets';
import { cropSprite, pottedPlant } from './GardenScene';
import { cropLook } from './sceneLayout';

const DAYS_RANGE = { min: 1, max: 365 } as const;
const YIELD_RANGE = { min: 1, max: 9999 } as const;

export interface CropDraft {
  /** Picker values: `m:<materialId>`, `d:<itemId>` or '' while unchosen. */
  seedKey: string;
  harvestKey: string;
  plotType: PlotType;
  days: number;
  yield: number;
  rare: boolean;
  price: CoinBag;
  /** Undefined: automatic. */
  look: CropLook | undefined;
}

export type CropFormResult =
  { ok: true; crop: CropFields } | { ok: false; reason: 'missing_material' | 'empty_price' };

/** A rare crop has no price, so whatever is typed there is dropped. */
export function cropFormValues(form: CropDraft): CropFormResult {
  const seed = parseRefKey(form.seedKey);
  const harvest = parseRefKey(form.harvestKey);
  if (!seed || !harvest) return { ok: false, reason: 'missing_material' };
  const { plotType, days, yield: quantity, look } = form;
  const base = { seed, harvest, plotType, days, yield: quantity, ...(look ? { look } : {}) };
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

/** `auto` keeps no look, so the garden goes on drawing one from the seed. Foliage has no color. */
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
  /** Present when editing. */
  crop?: Crop;
  /** The group depot, to link items and create them; absent: materials only. */
  depot?: DepotAccess | undefined;
  /** Saves the crop and returns whether it now exists. */
  save(crop: CropFields): boolean;
}

/** Modal form of a crop. It closes when `save` accepts the crop. */
export function openCropForm({ state, catalog, crop, depot, save }: CropFormOptions): void {
  const texts = t.garden.crops;
  // One crop per seed: seeds of the other crops are not offered.
  const taken = new Set(
    state.garden.crops.flatMap((other) => (other.id === crop?.id ? [] : [refKey(other.seed)])),
  );
  const refreshAll = () => pickers.forEach((picker) => picker.refresh());
  const seedPicker = stockPicker({
    label: texts.seed,
    state,
    depot,
    value: crop?.seed,
    allows: (key) => !taken.has(key),
    onCreated: refreshAll,
  });
  const harvestPicker = stockPicker({
    label: texts.harvest,
    state,
    depot,
    value: crop?.harvest,
    onCreated: refreshAll,
  });
  const pickers = [seedPicker, harvestPicker];
  const seed = seedPicker.select;
  const harvest = harvestPicker.select;
  const hasFreeSeeds = () => seed.options.length > 1;
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
  const look = lookPicker(seed, seedPicker.read, crop?.look);
  const pricePart = el('div', { class: 'field' }, el('span', {}, texts.price), prices.element);
  const noSeeds = el('p', { class: 'panel__hint' }, texts.noSeeds);
  const submitButton = el('button', { class: 'btn btn--primary', type: 'submit' }, texts.save);

  const read = () =>
    cropFormValues({
      seedKey: seed.value,
      harvestKey: harvest.value,
      plotType: parsePlotType(plotType.value),
      days: Number(days.value),
      yield: Number(quantity.value),
      rare: rare.checked,
      price: prices.read(),
      look: look.read(),
    });
  const sync = () => {
    pricePart.hidden = rare.checked;
    noSeeds.hidden = hasFreeSeeds();
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
      field(texts.seed, seedPicker.element),
      noSeeds,
      field(texts.harvest, harvestPicker.element),
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
function lookPicker(
  seed: HTMLSelectElement,
  readSeed: () => StockRef | undefined,
  initial: CropLook | undefined,
): LookPicker {
  const drawn = () => cropLook({ seed: readSeed() ?? NO_SEED });
  const texts = t.garden.crops.look;
  let mode: LookMode = initial?.kind ?? 'auto';
  // Starting from the drawn hue keeps the flower's color when "Flor" is picked.
  let hue = initial?.hue ?? drawn().hue;
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
    const shown = chosenLook(mode, hue) ?? drawn();
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

/** Before a seed is picked, the preview draws from an empty id, as it always did. */
const NO_SEED: StockRef = { source: 'material', materialId: '' };

function parsePlotType(value: string): PlotType {
  return plotTypeSchema.safeParse(value).data ?? 'canteiro';
}
