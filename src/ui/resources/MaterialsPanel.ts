import { t } from '../../i18n/pt-BR';
import type { Category, Material } from '../../model/schema';
import type { GameStore } from '../../store';
import {
  addMaterial,
  addMaterialCategory,
  adjustMaterial,
  removeMaterial,
  removeMaterialCategory,
  renameMaterialCategory,
  totalMaterialUnits,
  updateMaterial,
  type MaterialFields,
} from '../../systems/Materials';
import { el } from '../dom';
import { formatCount } from '../format';
import type { MasterSession } from '../MasterSession';
import type { ResourceMenuItem } from '../ResourceMenu';
import {
  button,
  categoryManager,
  confirmButton,
  field,
  numberInput,
  readCount,
  thumb,
  type Act,
} from '../widgets';

/** Materiais: one tab per category; the master adds, edits and counts materials. */
export class MaterialsPanel {
  private tab: string | null = null;
  private expanded: string | null = null;
  private editing: string | null = null;
  private redraw: () => void = () => undefined;

  constructor(
    private readonly store: GameStore,
    private readonly session: MasterSession,
    private readonly act: Act,
  ) {}

  get menuItem(): ResourceMenuItem {
    return {
      id: 'materials',
      label: t.resources.materials,
      icon: 'icon.materials',
      summary: (state) => t.resources.materialsSummary(totalMaterialUnits(state.materials)),
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
    const { catalog } = this.store;
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
      thumb(catalog, { image: material.icon, name: material.name }),
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
      this.act((s) => adjustMaterial(s, material.id, sign * readCount(amount)));
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
        confirmButton(t.common.remove, () => this.act((s) => removeMaterial(s, material.id))),
      ),
      isEditing &&
        this.materialForm(material, categories, (fields) => {
          if (this.act((s) => updateMaterial(s, material.id, fields)))
            this.update(() => (this.editing = null));
        }),
    );
  }

  private newMaterialForm(categoryId: string): HTMLElement {
    const quantity = numberInput({ min: 0, label: t.materials.quantity });
    const form = this.materialForm(
      undefined,
      [],
      (fields) => {
        this.act((s) =>
          addMaterial(s, { ...fields, category: categoryId, quantity: readCount(quantity) }),
        );
      },
      field(t.materials.quantity, quantity),
    );
    return el(
      'details',
      { class: 'card card--master' },
      el('summary', { class: 'section-title' }, t.materials.newMaterial),
      form,
    );
  }

  /** Shared add/edit form; the category select only appears when editing. */
  private materialForm(
    material: Material | undefined,
    categories: readonly Category[],
    onSubmit: (fields: MaterialFields) => void,
    ...extra: HTMLElement[]
  ): HTMLElement {
    const name = el('input', { class: 'input input--wide', value: material?.name ?? '' });
    const icon = el('input', { class: 'input input--wide', value: material?.icon ?? '' });
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
    return el(
      'form',
      {
        class: 'subform',
        onsubmit: (event: Event) => {
          event.preventDefault();
          onSubmit({
            name: name.value,
            category: categories.length > 0 ? category.value : (material?.category ?? ''),
            icon: icon.value,
            description: description.value,
          });
        },
      },
      field(t.common.name, name),
      categories.length > 0 && field(t.common.category, category),
      field(t.common.icon, icon),
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
  }

  private categoriesCard(currentId: string | null, isCurrentEmpty: boolean): HTMLElement {
    // Tab changes happen inside the action so they are in place when the store re-renders.
    return categoryManager(
      this.act,
      { categories: this.store.current.materials.categories, currentId, isCurrentEmpty },
      {
        add: (name) => (s) => {
          const outcome = addMaterialCategory(s, name);
          if (outcome.ok) this.tab = outcome.state.materials.categories.at(-1)?.id ?? null;
          return outcome;
        },
        rename: (id, name) => (s) => renameMaterialCategory(s, id, name),
        remove: (id) => (s) => {
          const outcome = removeMaterialCategory(s, id);
          if (outcome.ok) this.tab = null;
          return outcome;
        },
      },
    );
  }

  private update(change: () => void): void {
    change();
    this.redraw();
  }
}
