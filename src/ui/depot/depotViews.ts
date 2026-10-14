import { t } from '../../i18n/pt-BR';
import {
  ITEM_KINDS,
  ITEM_NOTES_LIMIT,
  NAME_LIMIT,
  QUANTITY_LIMIT,
  type DepotItem,
  type DepotSection,
  type ItemFields,
  type ItemKind,
} from '../../systems/Depot';
import { el } from '../dom';
import { button, confirmButton, field, selectInput } from '../widgets';

// Pieces of the depot window: item cards, the item and section editors, the trash.

/** A section the item can move to, labelled with its area when it is a private one. */
export interface MoveTarget {
  id: string;
  label: string;
}

export interface ItemCardDeps {
  isExpanded: boolean;
  moveTargets: readonly MoveTarget[];
  authorName: (authorId: string) => string;
  /** Shown above the name in search results. */
  sectionLabel?: string | undefined;
  isPrivate: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAdjust: (delta: number) => void;
  onMove: (sectionId: string) => void;
  onShift: (direction: 'up' | 'down') => void;
  onRemove: () => void;
}

export function itemCard(item: DepotItem, deps: ItemCardDeps): HTMLElement {
  const author = deps.authorName(item.authorId);
  const editor = item.editedBy && deps.authorName(item.editedBy);
  return el(
    'li',
    { class: 'archive-note depot-item' },
    el(
      'div',
      { class: 'depot-item__head' },
      el(
        'button',
        {
          class: 'archive-note__toggle',
          type: 'button',
          'aria-expanded': String(deps.isExpanded),
          onclick: deps.onToggle,
        },
        deps.sectionLabel && el('span', { class: 'archive-note__topic' }, deps.sectionLabel),
        el(
          'span',
          { class: 'archive-note__title' },
          `${t.depot.kindIcons[item.kind]} ${item.name}`,
          el('span', { class: 'depot-item__quantity' }, ` ${t.depot.quantity(item.quantity)}`),
        ),
        el(
          'span',
          { class: 'archive-note__meta' },
          `${t.depot.kinds[item.kind]} · ${t.depot.byline(author, editor || undefined)}`,
          deps.isPrivate && el('span', { class: 'archive-note__secret' }, t.depot.privateBadge),
        ),
      ),
      el(
        'div',
        { class: 'depot-item__stepper' },
        button('−', () => deps.onAdjust(-1), {
          title: t.depot.decrease,
          disabled: item.quantity <= 1,
        }),
        button('+', () => deps.onAdjust(1), {
          title: t.depot.increase,
          disabled: item.quantity >= QUANTITY_LIMIT,
        }),
      ),
    ),
    deps.isExpanded &&
      el(
        'div',
        { class: 'archive-note__body' },
        item.notes && el('p', { class: 'depot-item__notes' }, item.notes),
        itemActions(deps),
      ),
  );
}

function itemActions(deps: ItemCardDeps): HTMLElement {
  const moveSelect = selectInput({
    label: t.depot.moveTo,
    options: deps.moveTargets.map((target) => ({ value: target.id, label: target.label })),
    value: deps.moveTargets[0]?.id ?? '',
  });
  const canMove = deps.moveTargets.length > 0;
  return el(
    'div',
    { class: 'row row--wrap archive-note__actions' },
    button(t.depot.edit, deps.onEdit),
    button('↑', () => deps.onShift('up'), { title: t.depot.moveUp }),
    button('↓', () => deps.onShift('down'), { title: t.depot.moveDown }),
    canMove && moveSelect,
    canMove && button(t.depot.move, () => deps.onMove(moveSelect.value)),
    confirmButton(t.depot.remove, deps.onRemove),
  );
}

export function sectionName(section: Pick<DepotSection, 'name' | 'icon'>): string {
  return section.icon ? `${section.icon} ${section.name}` : section.name;
}

// ---------------------------------------------------------------- item editor

export interface ItemEditorOptions {
  item: DepotItem | null;
  onSave: (fields: ItemFields) => void;
  onCancel: () => void;
}

/** Built once per edit, so a re-render of the window never wipes what is being typed. */
export function itemEditor({ item, onSave, onCancel }: ItemEditorOptions): HTMLElement {
  const name = el('input', {
    class: 'input input--wide',
    type: 'text',
    maxlength: String(NAME_LIMIT),
    required: true,
    value: item?.name ?? '',
  });
  const kind = selectInput({
    label: t.depot.itemKind,
    options: ITEM_KINDS.map((value) => ({
      value,
      label: `${t.depot.kindIcons[value]} ${t.depot.kinds[value]}`,
    })),
    value: item?.kind ?? 'equipamento',
  });
  const quantity = el('input', {
    class: 'input archive-editor__number',
    type: 'number',
    min: '1',
    max: String(QUANTITY_LIMIT),
    step: '1',
    required: true,
    value: String(item?.quantity ?? 1),
  });
  const notes = el('textarea', {
    class: 'input',
    rows: '5',
    maxlength: String(ITEM_NOTES_LIMIT),
  });
  notes.value = item?.notes ?? '';

  const form = el(
    'form',
    { class: 'archive-editor' },
    field(t.depot.itemName, name),
    el(
      'div',
      { class: 'row row--wrap' },
      field(t.depot.itemKind, kind),
      field(t.depot.itemQuantity, quantity),
    ),
    field(t.depot.itemNotes, notes),
    el(
      'div',
      { class: 'row row--end' },
      button(t.depot.cancel, onCancel),
      el('button', { class: 'btn btn--primary', type: 'submit' }, t.depot.save),
    ),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSave({
      name: name.value,
      kind: parseKind(kind.value),
      quantity: Math.floor(Number(quantity.value)) || 0,
      notes: notes.value,
    });
  });
  queueMicrotask(() => name.focus());
  return form;
}

function parseKind(value: string): ItemKind {
  return ITEM_KINDS.find((kind) => kind === value) ?? 'outro';
}

// ---------------------------------------------------------------- section editor

export interface SectionEditorOptions {
  section: DepotSection | null;
  /** Where a new section goes, as a line above the fields ("Área privada de Bia"). */
  areaLabel: string;
  onSave: (fields: { name: string; icon: string }) => void;
  onCancel: () => void;
}

export function sectionEditor({
  section,
  areaLabel,
  onSave,
  onCancel,
}: SectionEditorOptions): HTMLElement {
  const icon = el('input', {
    class: 'input archive-editor__icon',
    type: 'text',
    maxlength: '8',
    value: section?.icon ?? '',
    placeholder: '🗡️',
  });
  const name = el('input', {
    class: 'input input--wide',
    type: 'text',
    maxlength: String(NAME_LIMIT),
    required: true,
    value: section?.name ?? '',
  });
  const form = el(
    'form',
    { class: 'archive-editor' },
    el('p', { class: 'panel__hint' }, areaLabel),
    el('div', { class: 'row' }, field(t.depot.sectionIcon, icon), field(t.depot.sectionName, name)),
    el(
      'div',
      { class: 'row row--end' },
      button(t.depot.cancel, onCancel),
      el(
        'button',
        { class: 'btn btn--primary', type: 'submit' },
        section ? t.depot.saveSection : t.depot.createSection,
      ),
    ),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSave({ name: name.value, icon: icon.value });
  });
  queueMicrotask(() => name.focus());
  return form;
}

// ---------------------------------------------------------------- trash

export interface DepotTrashOptions {
  sections: readonly DepotSection[];
  items: readonly DepotItem[];
  sectionNameOf: (sectionId: string) => string;
  isMaster: boolean;
  onRestoreSection: (sectionId: string) => void;
  onRestoreItem: (itemId: string) => void;
  onEmpty: () => void;
}

export function depotTrashView(options: DepotTrashOptions): HTMLElement[] {
  const rows = [
    ...options.sections.map((section) =>
      trashRow(t.depot.trashedSection(sectionName(section)), () =>
        options.onRestoreSection(section.id),
      ),
    ),
    ...options.items.map((item) =>
      trashRow(
        t.depot.trashedItem(
          `${item.name} ${t.depot.quantity(item.quantity)}`,
          options.sectionNameOf(item.sectionId),
        ),
        () => options.onRestoreItem(item.id),
      ),
    ),
  ];
  return [
    el('h3', { class: 'section-title' }, t.depot.trashTitle),
    el('p', { class: 'panel__hint' }, t.depot.trashHint),
    rows.length === 0
      ? el('p', { class: 'panel__hint' }, t.depot.trashEmpty)
      : el('ul', { class: 'item-list' }, ...rows),
    ...(options.isMaster && rows.length > 0
      ? [el('div', { class: 'row row--end' }, confirmButton(t.depot.emptyTrash, options.onEmpty))]
      : []),
  ];
}

function trashRow(label: string, onRestore: () => void): HTMLElement {
  return el(
    'li',
    { class: 'item-row' },
    el('span', { class: 'item-row__name' }, label),
    button(t.depot.restore, onRestore),
  );
}
