import { newId } from '../../commands/newId';
import { t } from '../../i18n/pt-BR';
import type { Catalog } from '../../model/catalog';
import type { GameState, ShopItem } from '../../model/schema';
import type { GameStore } from '../../store';
import type { CoinBag } from '../../systems/Coins';
import { ITEM_KINDS, type ItemKind } from '../../systems/Depot';
import type { ShopItemFields } from '../../systems/Shop';
import { el } from '../dom';
import { photoField, saveWithPhoto } from '../photos/photoField';
import {
  button,
  closeButton,
  field,
  keepEscapeInside,
  numberInput,
  parseCount,
  selectInput,
  type SelectOption,
} from '../widgets';

const MIN_LEVELS = [1, 2, 3] as const;

/** Materials still without a shop item; the one being edited keeps its own. */
export function materialOptions(state: GameState, editing?: ShopItem): SelectOption[] {
  const listed = new Set(
    state.shop.items.flatMap((item) =>
      item.kind === 'material' && item.id !== editing?.id ? [item.materialId] : [],
    ),
  );
  return state.materials.items
    .filter((material) => !listed.has(material.id))
    .map((material) => ({ value: material.id, label: material.name }));
}

/** null: infinite stock; undefined: the text is not a whole number, so the form cannot save. */
export function parseStock(isInfinite: boolean, text: string): number | null | undefined {
  if (isInfinite) return null;
  const count = Number(text);
  return text.trim() !== '' && Number.isInteger(count) && count >= 0 ? count : undefined;
}

/** A new equipment needs no material, so only the material kind depends on one being free. */
export function canSaveForm(opts: {
  isEquipment: boolean;
  hasFreeMaterial: boolean;
  isEditing: boolean;
}): boolean {
  return opts.isEditing || opts.isEquipment || opts.hasFreeMaterial;
}

/** One text per coin; blanks and zeros are left out. */
export function priceBag(texts: Readonly<Record<string, string>>): CoinBag {
  return Object.fromEntries(
    Object.entries(texts).flatMap(([coin, text]) => {
      const count = parseCount(text);
      return count > 0 ? [[coin, count]] : [];
    }),
  );
}

interface CommonValues {
  price: CoinBag;
  isInfinite: boolean;
  stockText: string;
  minLevel: number;
  featured: boolean;
  hidden: boolean;
}

export type FormValues = CommonValues &
  (
    | { kind: 'material'; materialId: string }
    | { kind: 'equipment'; name: string; description: string; depotKind: ItemKind }
  );

/** null when the stock text is invalid. */
export function buildFields(values: FormValues): ShopItemFields | null {
  const stock = parseStock(values.isInfinite, values.stockText);
  if (stock === undefined) return null;
  const common = {
    price: values.price,
    stock,
    minLevel: values.minLevel,
    featured: values.featured,
    hidden: values.hidden,
  };
  if (values.kind === 'material') {
    return { ...common, kind: 'material', materialId: values.materialId };
  }
  return {
    ...common,
    kind: 'equipment',
    name: values.name,
    description: values.description,
    depotKind: values.depotKind,
  };
}

export interface ShopItemFormOptions {
  game: GameStore;
  /** Present when editing. */
  item?: ShopItem;
  /** Saves the item and returns whether it now exists; a refused photo does not count against it. */
  save(id: string, fields: ShopItemFields, image: string): boolean;
}

/** Modal form of a shop item. It closes when `save` accepts the item. */
export function openShopItemForm({ game, item, save }: ShopItemFormOptions): void {
  const texts = t.shop.master.form;
  const { catalog, current } = game;
  const id = item?.id ?? newId('shop');
  const options = materialOptions(current, item);

  const kind = selectInput({
    label: texts.kind,
    value: item?.kind ?? 'material',
    options: [
      { value: 'material', label: texts.kinds.material },
      { value: 'equipment', label: texts.kinds.equipment },
    ],
  });
  kind.disabled = item !== undefined;
  const material = selectInput({
    label: texts.material,
    value: item?.kind === 'material' ? item.materialId : '',
    options,
  });
  const name = el('input', {
    class: 'input input--wide',
    value: item?.kind === 'equipment' ? item.name : '',
  });
  const description = el('textarea', { class: 'input input--wide', rows: '3' });
  description.value = item?.kind === 'equipment' ? item.description : '';
  const depotKind = selectInput({
    label: texts.depotKind,
    value: item?.kind === 'equipment' ? item.depotKind : 'equipamento',
    options: ITEM_KINDS.map((value) => ({ value, label: t.depot.kinds[value] })),
  });
  const photo = photoField({
    source: game,
    current: item?.image,
    name: item?.kind === 'equipment' ? item.name : '',
  });
  const prices = priceInputs(catalog, item?.price);
  const isInfinite = el('input', { type: 'checkbox', checked: item ? item.stock === null : true });
  const stock = numberInput({ min: 0, value: item?.stock ?? 1, label: texts.stock });
  const minLevel = selectInput({
    label: texts.minLevel,
    value: String(item?.minLevel ?? 1),
    options: MIN_LEVELS.map((level) => ({ value: String(level), label: `Nv ${level}` })),
  });
  const featured = el('input', { type: 'checkbox', checked: item?.featured ?? false });
  const hidden = el('input', { type: 'checkbox', checked: item?.hidden ?? false });

  const isEquipment = () => kind.value === 'equipment';
  const materialPart = el('div', { class: 'field' }, field(texts.material, material));
  const equipmentPart = el(
    'div',
    { class: 'field' },
    field(texts.name, name),
    field(texts.description, description),
    field(texts.depotKind, depotKind),
  );
  const noMaterials = el('p', { class: 'panel__hint' }, texts.noMaterials);
  const submitButton = el('button', { class: 'btn btn--primary', type: 'submit' }, texts.save);
  const syncVisibility = () => {
    materialPart.hidden = isEquipment();
    equipmentPart.hidden = !isEquipment();
    noMaterials.hidden = isEquipment() || options.length > 0;
    stock.disabled = isInfinite.checked;
    const hasValidStock = parseStock(isInfinite.checked, stock.value) !== undefined;
    submitButton.disabled =
      !hasValidStock ||
      !canSaveForm({
        isEquipment: isEquipment(),
        hasFreeMaterial: options.length > 0,
        isEditing: item !== undefined,
      });
  };
  kind.addEventListener('change', syncVisibility);
  isInfinite.addEventListener('change', syncVisibility);
  stock.addEventListener('input', syncVisibility);

  const common = () => ({
    price: prices.read(),
    isInfinite: isInfinite.checked,
    stockText: stock.value,
    minLevel: Number(minLevel.value),
    featured: featured.checked,
    hidden: hidden.checked,
  });
  const read = (): FormValues =>
    isEquipment()
      ? {
          ...common(),
          kind: 'equipment',
          name: name.value,
          description: description.value,
          depotKind: parseKind(depotKind.value),
        }
      : { ...common(), kind: 'material', materialId: material.value };

  const submit = () => {
    const values = read();
    const fields = buildFields(values);
    if (!fields) return;
    void saveWithPhoto(photo, { kind: 'shop_item', id }, (image) => {
      const saved = save(id, fields, image);
      if (saved) dialog.close();
      return saved;
    });
  };

  const dialog = el(
    'dialog',
    {
      class: 'dialog dialog--shop-confirm',
      'aria-label': item ? texts.editTitle : texts.newTitle,
    },
    el(
      'header',
      { class: 'menu__header' },
      el('h2', { class: 'panel__title' }, item ? texts.editTitle : texts.newTitle),
      closeButton(texts.close, () => dialog.close()),
    ),
    el(
      'form',
      {
        class: 'shop-confirm__body',
        onsubmit: (event: Event) => {
          event.preventDefault();
          submit();
        },
      },
      field(texts.kind, kind),
      materialPart,
      noMaterials,
      equipmentPart,
      el('div', { class: 'field' }, el('span', {}, texts.photo), photo.element),
      el('div', { class: 'field' }, el('span', {}, texts.price), prices.element),
      el('label', { class: 'row' }, isInfinite, texts.infiniteStock),
      field(texts.stock, stock),
      field(texts.minLevel, minLevel),
      el('label', { class: 'row' }, featured, texts.featured),
      el('label', { class: 'row' }, hidden, texts.hidden),
      el(
        'div',
        { class: 'row row--end' },
        button(texts.cancel, () => dialog.close()),
        submitButton,
      ),
    ),
  );
  photo.listenOn(dialog);
  keepEscapeInside(dialog);
  syncVisibility();
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

function parseKind(value: string): ItemKind {
  return ITEM_KINDS.find((kind) => kind === value) ?? 'outro';
}

function priceInputs(
  catalog: Catalog,
  initial: CoinBag | undefined,
): { element: HTMLElement; read(): CoinBag } {
  const rows = catalog.currencies.map((currency) => ({
    currency,
    input: numberInput({ min: 0, value: initial?.[currency.id], label: currency.name }),
  }));
  return {
    element: el(
      'div',
      { class: 'coin-inputs' },
      ...rows.map(({ currency, input }) =>
        el('label', { class: 'row' }, el('span', { class: 'row__name' }, currency.name), input),
      ),
    ),
    read: () => priceBag(Object.fromEntries(rows.map((r) => [r.currency.id, r.input.value]))),
  };
}
