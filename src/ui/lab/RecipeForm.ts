import { t } from '../../i18n/pt-BR';
import {
  stationTypeSchema,
  type Category,
  type GameState,
  type Portion,
  type Recipe,
  type StationType,
} from '../../model/schema';
import type { RecipeFields } from '../../systems/Lab';
import { parseRefKey } from '../../systems/Stock';
import { el } from '../dom';
import { stockPicker, type DepotAccess, type StockPicker } from '../stock/StockPicker';
import { button, closeButton, field, keepEscapeInside, numberInput } from '../widgets';
import { liquidColor } from './labSceneLayout';

const DAYS_RANGE = { min: 1, max: 365 } as const;
const QUANTITY_RANGE = { min: 1, max: 9999 } as const;
const MAX_INGREDIENTS = 6;
const DEFAULT_COLOR = '#9b6bff';

/** A row of the form: the picker value (`m:`/`d:` key, '' while unchosen) and the amount. */
export interface IngredientDraft {
  key: string;
  quantity: number;
}

export interface RecipeDraft {
  outputKey: string;
  outputQty: number;
  /** One per row of the form; an empty `key` is a row still to fill. */
  ingredients: IngredientDraft[];
  stationType: StationType;
  days: number;
  /** Undefined: drawn from the potion. */
  color: string | undefined;
  hidden: boolean;
}

export type RecipeFormReason = keyof typeof t.lab.recipes.reasons;

export type RecipeFormResult =
  { ok: true; recipe: RecipeFields } | { ok: false; reason: RecipeFormReason };

/** The same rules the server applies, checked before sending so the form can say what is wrong. */
export function recipeFormValues(form: RecipeDraft): RecipeFormResult {
  const reason = refusal(form);
  const output = parseRefKey(form.outputKey);
  const ingredients = form.ingredients.flatMap(({ key, quantity }): Portion[] => {
    const ref = parseRefKey(key);
    return ref ? [{ ref, quantity }] : [];
  });
  if (reason) return { ok: false, reason };
  if (!output || ingredients.length !== form.ingredients.length) {
    return { ok: false, reason: 'missing_material' };
  }
  const { outputQty, stationType, days, color, hidden } = form;
  return {
    ok: true,
    recipe: {
      output,
      outputQty,
      ingredients,
      stationType,
      days,
      ...(color ? { color } : {}),
      hidden,
    },
  };
}

function refusal(form: RecipeDraft): RecipeFormReason | undefined {
  const ids = form.ingredients.map((i) => i.key);
  if (form.outputKey === '' || ids.includes('')) return 'missing_material';
  if (ids.length === 0) return 'no_ingredients';
  if (ids.length > MAX_INGREDIENTS) return 'too_many_ingredients';
  if (new Set(ids).size !== ids.length) return 'repeated_ingredient';
  if (ids.includes(form.outputKey)) return 'output_among_ingredients';
  const quantities = [form.outputQty, ...form.ingredients.map((i) => i.quantity)];
  const inRange =
    isWithin(form.days, DAYS_RANGE) && quantities.every((q) => isWithin(q, QUANTITY_RANGE));
  return inRange ? undefined : 'out_of_range';
}

function isWithin(value: number, { min, max }: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** The "Poções" category first, so the potion select opens on it. */
export function potionsFirst(categories: readonly Category[]): Category[] {
  const isPotions = (category: Category) =>
    category.name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() === 'pocoes';
  return [...categories.filter(isPotions), ...categories.filter((c) => !isPotions(c))];
}

export interface RecipeFormOptions {
  state: GameState;
  /** Present when editing. */
  recipe?: Recipe;
  /** The group depot, to link items and create them; absent: materials only. */
  depot?: DepotAccess | undefined;
  /** Saves the recipe and returns whether it now exists. */
  save(recipe: RecipeFields): boolean;
}

interface IngredientRow {
  node: HTMLElement;
  picker: StockPicker;
  read: () => IngredientDraft;
}

/** Modal form of a recipe. New recipes start hidden from the players. It closes when `save` accepts. */
export function openRecipeForm({ state, recipe, depot, save }: RecipeFormOptions): void {
  const texts = t.lab.recipes;
  const categoriesFirst = potionsFirst(state.materials.categories).map((c) => c.id);
  const rows: IngredientRow[] = [];
  const refreshAll = () =>
    [potionPicker, ...rows.map((row) => row.picker)].forEach((p) => p.refresh());
  const pickerFor = (label: string, value: Portion['ref'] | undefined) =>
    stockPicker({ label, state, depot, value, categoriesFirst, onCreated: refreshAll });
  const potionPicker = pickerFor(texts.potion, recipe?.output);
  const potion = potionPicker.select;
  const rowsList = el('ul', { class: 'recipe-form__rows' });
  const addButton = button(texts.addIngredient, () => addRow(undefined));
  const stationType = el(
    'select',
    { class: 'input', 'aria-label': texts.stationType },
    ...stationTypeSchema.options.map((type) =>
      el(
        'option',
        { value: type, selected: type === (recipe?.stationType ?? 'alambique') },
        t.lab.scene.stationTypes[type],
      ),
    ),
  );
  const days = numberInput({ ...DAYS_RANGE, value: recipe?.days ?? 1, label: texts.days });
  const quantity = numberInput({
    ...QUANTITY_RANGE,
    value: recipe?.outputQty ?? 1,
    label: texts.yield,
  });
  const ownColor = el('input', { type: 'checkbox', checked: recipe?.color !== undefined });
  const color = el('input', {
    class: 'recipe-form__color',
    type: 'color',
    value: recipe?.color ?? DEFAULT_COLOR,
    'aria-label': texts.color,
  });
  const flask = el('span', { class: 'lab-icon lab-icon--flask recipe-form__flask' });
  const hidden = el('input', { type: 'checkbox', checked: recipe?.hidden ?? true });
  const reasonText = el('p', { class: 'panel__hint recipe-form__reason', role: 'status' });
  const submitButton = el('button', { class: 'btn btn--primary', type: 'submit' }, texts.save);

  const read = () =>
    recipeFormValues({
      outputKey: potion.value,
      outputQty: Number(quantity.value),
      ingredients: rows.map((row) => row.read()),
      stationType: stationTypeSchema.safeParse(stationType.value).data ?? 'alambique',
      days: Number(days.value),
      color: ownColor.checked ? color.value : undefined,
      hidden: hidden.checked,
    });
  const sync = () => {
    const result = read();
    submitButton.disabled = !result.ok;
    reasonText.textContent = result.ok ? '' : texts.reasons[result.reason];
    addButton.disabled = rows.length >= MAX_INGREDIENTS;
    color.disabled = !ownColor.checked;
    const output = potionPicker.read() ?? { source: 'material', materialId: '' };
    const shown = ownColor.checked ? color.value : liquidColor({ output });
    flask.style.setProperty('--liquid', shown);
  };
  const addRow = (portion: Portion | undefined) => {
    const row = ingredientRow(pickerFor(texts.ingredient, portion?.ref), portion, () => {
      rows.splice(rows.indexOf(row), 1);
      row.node.remove();
      sync();
    });
    rows.push(row);
    rowsList.append(row.node);
    row.node.addEventListener('input', sync);
    sync();
  };
  (recipe?.ingredients ?? [undefined]).forEach(addRow);
  for (const control of [potion, stationType, days, quantity, ownColor, color, hidden]) {
    control.addEventListener('input', sync);
  }

  const dialog = el(
    'dialog',
    {
      class: 'dialog dialog--shop-confirm',
      'aria-label': recipe ? texts.editTitle : texts.newTitle,
    },
    el(
      'header',
      { class: 'menu__header' },
      el('h2', { class: 'panel__title' }, recipe ? texts.editTitle : texts.newTitle),
      closeButton(texts.close, () => dialog.close()),
    ),
    el(
      'form',
      {
        class: 'shop-confirm__body',
        onsubmit: (event: Event) => {
          event.preventDefault();
          const result = read();
          if (result.ok && save(result.recipe)) dialog.close();
        },
      },
      field(texts.potion, potionPicker.element),
      el(
        'fieldset',
        { class: 'recipe-form__ingredients' },
        el('legend', { class: 'crop-look__title' }, texts.ingredients),
        rowsList,
        addButton,
      ),
      field(texts.stationType, stationType),
      field(texts.days, days),
      field(texts.yield, quantity),
      el(
        'div',
        { class: 'recipe-form__look' },
        el('label', { class: 'row' }, ownColor, texts.ownColor),
        color,
        el('span', { class: 'recipe-form__preview', title: texts.preview }, flask),
      ),
      el('label', { class: 'row' }, hidden, texts.hidden),
      el('p', { class: 'panel__hint' }, texts.hiddenHint),
      reasonText,
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

function ingredientRow(
  picker: StockPicker,
  portion: Portion | undefined,
  onRemove: () => void,
): IngredientRow {
  const texts = t.lab.recipes;
  const quantity = numberInput({
    ...QUANTITY_RANGE,
    value: portion?.quantity ?? 1,
    label: texts.quantity,
  });
  const node = el(
    'li',
    { class: 'recipe-form__row' },
    picker.element,
    quantity,
    el(
      'button',
      {
        class: 'btn btn--icon',
        type: 'button',
        'aria-label': texts.removeIngredient,
        title: texts.removeIngredient,
        onclick: onRemove,
      },
      '×',
    ),
  );
  return {
    node,
    picker,
    read: () => ({ key: picker.select.value, quantity: Number(quantity.value) }),
  };
}
