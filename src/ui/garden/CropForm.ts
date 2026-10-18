import { t } from '../../i18n/pt-BR';
import type { Catalog } from '../../model/catalog';
import { plotTypeSchema, type Crop, type GameState, type PlotType } from '../../model/schema';
import type { CoinBag } from '../../systems/Coins';
import { el } from '../dom';
import { priceInputs } from '../shop/ShopItemForm';
import { button, closeButton, field, keepEscapeInside, numberInput } from '../widgets';

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
}

export type CropFormResult =
  { ok: true; crop: Crop } | { ok: false; reason: 'missing_material' | 'empty_price' };

/** A rare crop has no price, so whatever is typed there is dropped. */
export function cropFormValues(form: CropDraft): CropFormResult {
  if (form.seedId === '' || form.harvestId === '') return { ok: false, reason: 'missing_material' };
  const { seedId, harvestId, plotType, days, yield: quantity } = form;
  const base = { seedId, harvestId, plotType, days, yield: quantity };
  if (form.rare) return { ok: true, crop: { ...base, rare: true } };
  const hasPrice = Object.values(form.price).some((amount) => amount > 0);
  if (!hasPrice) return { ok: false, reason: 'empty_price' };
  return { ok: true, crop: { ...base, rare: false, price: form.price } };
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

/** Materials grouped by category, so "Sementes" and "Ervas" stand out. */
function materialSelect(
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
