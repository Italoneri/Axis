import { newId } from '../../commands/newId';
import { t } from '../../i18n/pt-BR';
import type { GameState, StockRef } from '../../model/schema';
import { normalizeForSearch } from '../../systems/Archive';
import {
  activeSections,
  EMPTY_DEPOT,
  sectionItems,
  type Depot,
  type DepotCommand,
  type ItemKind,
} from '../../systems/Depot';
import { parseRefKey, refKey } from '../../systems/Stock';
import { el } from '../dom';
import { button } from '../widgets';

// One <select> for the ends of crops and recipes: an item of a group depot
// section ("Depósito › porções") or a material, by category. Option values are
// ref keys (`d:<itemId>`, `m:<materialId>`), never names.

export interface StockChoice {
  key: string;
  label: string;
}

export interface StockGroup {
  label: string;
  choices: StockChoice[];
}

export interface StockGroupOptions {
  /** Keeps only these keys (say, seeds no other crop uses yet). */
  allows?: (key: string) => boolean;
  /** Material category ids listed first, in this order ("porções" for potions). */
  categoriesFirst?: readonly string[];
}

/** Group depot sections with items in use, then material categories; empty groups are left out. */
export function stockGroups(
  state: GameState,
  depot: Depot,
  { allows = () => true, categoriesFirst = [] }: StockGroupOptions = {},
): StockGroup[] {
  const materialNames = new Set(state.materials.items.map((m) => normalizeForSearch(m.name)));
  const texts = t.depot.stock;
  const depotGroups = activeSections(depot, null).map((section) => ({
    label: texts.section(section.name),
    choices: sectionItems(depot, section.id).map((item) => ({
      key: refKey({ source: 'depot', itemId: item.id }),
      label: materialNames.has(normalizeForSearch(item.name))
        ? texts.sameAsMaterial(item.name, item.quantity)
        : texts.option(item.name, item.quantity),
    })),
  }));
  const groups = [...depotGroups, ...materialGroups(state, categoriesFirst)];
  return groups
    .map((group) => ({ ...group, choices: group.choices.filter((c) => allows(c.key)) }))
    .filter((group) => group.choices.length > 0);
}

function materialGroups(state: GameState, first: readonly string[]): StockGroup[] {
  const { categories, items } = state.materials;
  const rank = (id: string) => (first.includes(id) ? first.indexOf(id) : first.length);
  const ordered = [...categories].sort((a, b) => rank(a.id) - rank(b.id));
  const choicesOf = (members: typeof items) =>
    members.map((m) => ({ key: refKey({ source: 'material', materialId: m.id }), label: m.name }));
  const known = new Set(categories.map((category) => category.id));
  return [
    ...ordered.map((category) => ({
      label: category.name,
      choices: choicesOf(items.filter((m) => m.category === category.id)),
    })),
    {
      label: t.garden.crops.uncategorized,
      choices: choicesOf(items.filter((m) => !known.has(m.category))),
    },
  ];
}

/** What the picker needs from the depot store: the depot it shows and a way to add an item. */
export interface DepotAccess {
  readonly current: Depot;
  dispatch(command: DepotCommand): Promise<boolean>;
}

/** The depot store as windows use it: they also redraw when it changes. */
export interface DepotSource extends DepotAccess {
  subscribe(listener: () => void): () => void;
}

export interface StockPickerOptions extends StockGroupOptions {
  label: string;
  state: GameState;
  /** Absent: only materials, and no "+ Criar no Depósito". */
  depot?: DepotAccess | undefined;
  value: StockRef | undefined;
  /** An item was created and picked here: other pickers of the form may refresh. */
  onCreated?: () => void;
}

export interface StockPicker {
  element: HTMLElement;
  select: HTMLSelectElement;
  read: () => StockRef | undefined;
  /** Rebuilds the options from the depot as it is now, keeping the choice. */
  refresh: () => void;
}

export function stockPicker(options: StockPickerOptions): StockPicker {
  const select = el('select', { class: 'input', 'aria-label': options.label });
  const fill = (key: string) => {
    const groups = stockGroups(options.state, options.depot?.current ?? EMPTY_DEPOT, options);
    const known = groups.some((group) => group.choices.some((choice) => choice.key === key));
    // A link to an item that left the depot stays visible, flagged, until the master relinks it.
    const removed =
      key.startsWith('d:') && !known
        ? [el('option', { value: key, selected: true }, t.depot.stock.removed)]
        : [];
    const option = (choice: StockChoice) =>
      el('option', { value: choice.key, selected: choice.key === key }, choice.label);
    select.replaceChildren(
      el('option', { value: '', selected: key === '' }, '—'),
      ...removed,
      ...groups.map((group) =>
        el('optgroup', { label: group.label }, ...group.choices.map(option)),
      ),
    );
  };
  fill(options.value ? refKey(options.value) : '');
  const refresh = () => fill(select.value);
  const create = options.depot
    ? createInDepot(options.depot, (key) => {
        fill(key);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        options.onCreated?.();
      })
    : undefined;
  const element = el('div', { class: 'stock-picker' }, select, ...(create ? [create] : []));
  return { element, select, read: () => parseRefKey(select.value), refresh };
}

const NEW_SECTION = '__new__';
const CREATED_KINDS: readonly ItemKind[] = ['pocao', 'outro'];

/** "+ Criar no Depósito": name, section (or a new one) and kind; the item starts at 0. */
function createInDepot(depot: DepotAccess, picked: (key: string) => void): HTMLElement {
  const texts = t.depot.stock;
  const name = el('input', { class: 'input', type: 'text', 'aria-label': t.depot.itemName });
  const section = el('select', { class: 'input', 'aria-label': t.depot.sectionName });
  const sectionName = el('input', {
    class: 'input',
    type: 'text',
    'aria-label': texts.newSectionName,
  });
  const kind = el(
    'select',
    { class: 'input', 'aria-label': t.depot.itemKind },
    ...CREATED_KINDS.map((k) => el('option', { value: k }, t.depot.kinds[k])),
  );
  const form = el(
    'div',
    { class: 'stock-picker__create', hidden: true },
    name,
    section,
    sectionName,
    kind,
    button(t.depot.createSection, () => void submit()),
  );
  const syncSection = () => (sectionName.hidden = section.value !== NEW_SECTION);
  section.addEventListener('input', syncSection);
  const open = () => {
    section.replaceChildren(
      ...activeSections(depot.current, null).map((s) => el('option', { value: s.id }, s.name)),
      el('option', { value: NEW_SECTION }, texts.newSection),
    );
    syncSection();
    form.hidden = false;
    name.focus();
  };
  const submit = async () => {
    const sectionId = section.value === NEW_SECTION ? newId('sec') : section.value;
    if (section.value === NEW_SECTION) {
      const created = await depot.dispatch({
        type: 'section_create',
        id: sectionId,
        ownerId: null,
        name: sectionName.value,
      });
      if (!created) return;
    }
    const itemId = newId('item');
    const itemKind = CREATED_KINDS.find((k) => k === kind.value) ?? 'outro';
    const created = await depot.dispatch({
      type: 'item_create',
      id: itemId,
      sectionId,
      name: name.value,
      kind: itemKind,
      quantity: 0,
      notes: '',
    });
    if (!created) return;
    form.hidden = true;
    name.value = '';
    picked(refKey({ source: 'depot', itemId }));
  };
  const toggle = button(texts.create, () => (form.hidden ? open() : (form.hidden = true)));
  return el('div', { class: 'stock-picker__depot' }, toggle, form);
}
