import { t } from '../../i18n/pt-BR';
import type { Category, Material } from '../../model/schema';
import type { GameStore } from '../../store';
import { totalMaterialUnits, type MaterialFields } from '../../systems/Materials';
import { newId } from '../../commands/newId';
import { el } from '../dom';
import { formatCount } from '../format';
import { photoField, saveWithPhoto } from '../photos/photoField';
import type { MasterAccess } from '../MasterSession';
import type { ResourceMenuItem } from '../ResourceMenu';
import type { UiMemory } from '../uiMemory';
import {
  button,
  categoryManager,
  confirmButton,
  field,
  numberInput,
  readCount,
  thumb,
  type Act,
  type PanelDeps,
} from '../widgets';

const TAB_KEY = 'materials.tab';

/** Materiais: one tab per category; the master adds, edits and counts materials. */
export class MaterialsPanel {
  /** Kept open across re-renders so several materials can be added in a row. */
  private isNewMaterialOpen = false;
  private expanded: string | null = null;
  private editing: string | null = null;
  private redraw: () => void = () => undefined;

  private readonly store: GameStore;
  private readonly session: MasterAccess;
  private readonly act: Act;
  private readonly memory: UiMemory;

  /** Active category tab, remembered across re-renders and reloads. */
  private get tab(): string | null {
    return this.memory.get(TAB_KEY) || null;
  }

  private set tab(categoryId: string | null) {
    this.memory.set(TAB_KEY, categoryId ?? '');
  }

  constructor({ store, session, act, memory }: PanelDeps) {
    this.store = store;
    this.session = session;
    this.act = act;
    this.memory = memory;
  }

  get menuItem(): ResourceMenuItem {
    return {
      id: 'materials',
      label: t.resources.materials,
      icon: 'icon.materials',
      summary: (state) => t.resources.materialsSummary(totalMaterialUnits(state.materials)),
      compactSummary: (state) => formatCount(totalMaterialUnits(state.materials)),
      render: (redraw) => {
        this.redraw = redraw;
        return this.render();
      },
    };
  }

  private render(): HTMLElement[] {
    const { categories, items } = this.store.current.materials;
    const isMaster = this.session.isActive;
    const current = categories.find((c) => c.id === this.tab) ?? categories[0];
    if (!current) {
      return [
        el('p', { class: 'panel__hint' }, t.materials.noCategories),
        ...(isMaster ? [this.categoriesCard(null, true)] : []),
      ];
    }
    const inCategory = items.filter((m) => m.category === current.id);
    return [
      this.tabs(categories, current.id),
      inCategory.length === 0
        ? el('p', { class: 'panel__hint' }, t.materials.empty)
        : el('ul', { class: 'item-list' }, ...inCategory.map((m) => this.row(m, categories))),
      ...(isMaster
        ? [
            this.newMaterialForm(current.id),
            this.categoriesCard(current.id, inCategory.length === 0),
          ]
        : []),
    ];
  }

  private tabs(categories: readonly Category[], activeId: string): HTMLElement {
    return el(
      'nav',
      { class: 'tabs', role: 'tablist' },
      ...categories.map((c) =>
        el(
          'button',
          {
            class: c.id === activeId ? 'tab tab--active' : 'tab',
            type: 'button',
            role: 'tab',
            'aria-selected': String(c.id === activeId),
            onclick: () => this.update(() => (this.tab = c.id)),
          },
          c.name,
        ),
      ),
    );
  }

  private row(material: Material, categories: readonly Category[]): HTMLElement {
    const isExpanded = this.expanded === material.id;
    const head = el(
      'button',
      {
        class: 'item-row',
        type: 'button',
        title: material.description ?? '',
        'aria-expanded': String(isExpanded),
        onclick: () => this.update(() => (this.expanded = isExpanded ? null : material.id)),
      },
      thumb(this.store, { image: material.icon, name: material.name }),
      el('span', { class: 'item-row__name' }, material.name),
      el('span', { class: 'item-row__value' }, formatCount(material.quantity)),
    );
    return el(
      'li',
      { class: 'item' },
      head,
      isExpanded && material.description && el('p', { class: 'item__desc' }, material.description),
      this.session.isActive && this.masterControls(material, categories),
    );
  }

  private masterControls(material: Material, categories: readonly Category[]): HTMLElement {
    const amount = numberInput({ min: 0, label: t.materials.amount });
    const adjust = (sign: 1 | -1) =>
      this.act({
        type: 'adjust_material',
        materialId: material.id,
        delta: sign * readCount(amount),
      });
    const isEditing = this.editing === material.id;
    return el(
      'div',
      { class: 'item__master' },
      el(
        'div',
        { class: 'row row--wrap' },
        amount,
        button('−', () => adjust(-1), { title: t.common.decrease }),
        button('+', () => adjust(1), { title: t.common.increase }),
        button(t.common.edit, () =>
          this.update(() => (this.editing = isEditing ? null : material.id)),
        ),
        confirmButton(t.common.remove, () =>
          this.act({ type: 'remove_material', materialId: material.id }),
        ),
      ),
      isEditing &&
        this.materialForm(material, categories, (fields) => {
          const done = this.act({ type: 'update_material', materialId: material.id, ...fields });
          if (done) this.update(() => (this.editing = null));
          return done;
        }),
    );
  }

  private newMaterialForm(categoryId: string): HTMLElement {
    const quantity = numberInput({ min: 0, label: t.materials.quantity });
    const form = this.materialForm(
      undefined,
      [],
      (fields, id) =>
        this.act({
          type: 'add_material',
          id,
          ...fields,
          category: categoryId,
          quantity: readCount(quantity),
        }),
      field(t.materials.quantity, quantity),
    );
    const details = el(
      'details',
      { class: 'card card--master', open: this.isNewMaterialOpen },
      el('summary', { class: 'section-title' }, t.materials.newMaterial),
      form,
    );
    details.addEventListener('toggle', () => (this.isNewMaterialOpen = details.open));
    return details;
  }

  /**
   * Shared add/edit form; the category select only appears when editing.
   * `onSubmit` gets the id the icon was stored under: the material's, or a new one.
   */
  private materialForm(
    material: Material | undefined,
    categories: readonly Category[],
    onSubmit: (fields: MaterialFields, id: string) => boolean,
    ...extra: HTMLElement[]
  ): HTMLElement {
    const id = material?.id ?? newId('mat');
    const name = el('input', { class: 'input input--wide', value: material?.name ?? '' });
    const icon = photoField({
      source: this.store,
      current: material?.icon,
      name: material?.name ?? '',
    });
    const description = el('input', {
      class: 'input input--wide',
      value: material?.description ?? '',
    });
    const category = el(
      'select',
      { class: 'input' },
      ...categories.map((c) =>
        el('option', { value: c.id, selected: c.id === material?.category }, c.name),
      ),
    );
    const form = el(
      'form',
      {
        class: 'subform',
        onsubmit: (event: Event) => {
          event.preventDefault();
          void saveWithPhoto(icon, { kind: 'material', id }, (image) =>
            onSubmit(
              {
                name: name.value,
                category: categories.length > 0 ? category.value : (material?.category ?? ''),
                icon: image,
                description: description.value,
              },
              id,
            ),
          );
        },
      },
      field(t.common.name, name),
      categories.length > 0 && field(t.common.category, category),
      el('div', { class: 'field' }, el('span', {}, t.common.icon), icon.element),
      field(t.common.description, description),
      ...extra,
      el(
        'div',
        { class: 'row row--end' },
        el(
          'button',
          { class: 'btn btn--primary', type: 'submit' },
          material ? t.common.save : t.common.add,
        ),
      ),
    );
    icon.listenOn(form);
    return form;
  }

  private categoriesCard(currentId: string | null, isCurrentEmpty: boolean): HTMLElement {
    // A new category opens in its own tab; removing the current one falls back to the first.
    const act: Act = (command) => {
      const done = this.act(command);
      if (done && command.type === 'add_material_category')
        this.update(() => (this.tab = command.id));
      if (done && command.type === 'remove_material_category') this.update(() => (this.tab = null));
      return done;
    };
    return categoryManager(
      act,
      { categories: this.store.current.materials.categories, currentId, isCurrentEmpty },
      {
        add: (name) => ({ type: 'add_material_category', id: newId('matcat'), name }),
        rename: (categoryId, name) => ({ type: 'rename_material_category', categoryId, name }),
        remove: (categoryId) => ({ type: 'remove_material_category', categoryId }),
      },
    );
  }

  private update(change: () => void): void {
    change();
    this.redraw();
  }
}
