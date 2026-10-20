import type { DepotStore } from '../../depotStore';
import { newId } from '../../commands/newId';
import { MASTER_ACTOR } from '../../commands/applyCommand';
import { t } from '../../i18n/pt-BR';
import type { GameStore } from '../../store';
import { MASTER_AUTHOR } from '../../systems/Archive';
import { depotSnapshot, hasLinks, itemLinks } from '../../systems/Stock';
import {
  activeSections,
  privateOwners,
  searchItems,
  sectionItems,
  trashedItems,
  trashedSections,
  type Depot,
  type DepotCommand,
  type DepotItem,
  type DepotSection,
} from '../../systems/Depot';
import { CHARACTER_MEMORY_KEY } from '../archive/ArchiveWindow';
import { el } from '../dom';
import type { UiMemory } from '../uiMemory';
import { button, confirmButton, rememberedSelect } from '../widgets';
import {
  depotTrashView,
  itemCard,
  itemEditor,
  linkLabels,
  sectionEditor,
  sectionName,
  type MoveTarget,
} from './depotViews';

const SECTION_MEMORY_KEY = 'depot.section';

export interface DepotWindowDeps {
  depot: DepotStore;
  game: GameStore;
  memory: UiMemory;
  /** Offline players pick who they are (the same choice as in the Arquivo); online the login decides. */
  canPickCharacter: () => boolean;
}

type Pane =
  | { kind: 'section' }
  | { kind: 'trash' }
  /** Editors are built once and kept across re-renders, so typing is never lost. */
  | { kind: 'editor'; node: HTMLElement };

/** One area of the left column: the group's depot, or one character's private area. */
interface Area {
  ownerId: string | null;
  title: string;
  hint: string;
}

/**
 * "Depósito": a near full screen <dialog> like the Arquivo's, with the sections
 * of the group's depot and of the private area(s) on the left and the chosen
 * section's items on the right (two steps on phones).
 */
export class DepotWindow {
  private dialog: HTMLDialogElement | null = null;
  private sectionId: string | null = null;
  private pane: Pane = { kind: 'section' };
  private step: 'sections' | 'items' = 'sections';
  private readonly expanded = new Set<string>();
  private readonly cleanups: (() => void)[] = [];
  private readonly search = el('input', {
    class: 'input input--wide',
    type: 'search',
    placeholder: t.depot.search,
    'aria-label': t.depot.search,
  });
  private readonly characterSlot = el('div', { class: 'archive__character' });
  private readonly sectionsColumn = el('div', { class: 'archive__topic-list' });
  private readonly itemsColumn = el('section', { class: 'archive__notes' });
  private readonly layout = el('div', { class: 'archive' });

  constructor(private readonly deps: DepotWindowDeps) {
    this.search.addEventListener('input', () => {
      if (this.search.value.trim()) this.step = 'items';
      this.render();
    });
  }

  open(): void {
    if (this.dialog) return;
    this.sectionId = this.deps.memory.get(SECTION_MEMORY_KEY) ?? null;
    this.pane = { kind: 'section' };
    this.step = this.sectionId ? 'items' : 'sections';
    const dialog = this.buildDialog();
    this.dialog = dialog;
    this.cleanups.push(
      this.deps.depot.subscribe(() => this.render()),
      this.deps.game.subscribe(() => this.render()),
    );
    document.body.append(dialog);
    this.render();
    dialog.showModal();
    // Realtime may have missed something while the window was closed.
    void this.deps.depot.reload();
  }

  private buildDialog(): HTMLDialogElement {
    const dialog = el(
      'dialog',
      { class: 'dialog dialog--archive', 'aria-label': t.depot.title },
      el(
        'header',
        { class: 'archive__header' },
        el('h2', { class: 'panel__title' }, t.depot.title),
        this.characterSlot,
        el(
          'button',
          {
            class: 'btn btn--icon',
            type: 'button',
            'aria-label': t.depot.close,
            onclick: () => dialog.close(),
          },
          '×',
        ),
      ),
      el('div', { class: 'archive__searchbar' }, this.search),
      this.layout,
    );
    this.layout.replaceChildren(
      el('aside', { class: 'archive__topics' }, this.sectionsColumn),
      this.itemsColumn,
    );
    // Esc closes the dialog; the slot panel behind it should stay open.
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') event.stopPropagation();
    });
    dialog.addEventListener('close', () => {
      this.cleanups.splice(0).forEach((cleanup) => cleanup());
      dialog.remove();
      this.dialog = null;
    });
    return dialog;
  }

  private render(): void {
    if (!this.dialog) return;
    const depot = this.deps.depot.current;
    const sections = activeSections(depot);
    if (this.sectionId && !sections.some((s) => s.id === this.sectionId)) this.sectionId = null;
    this.layout.dataset.step = this.step === 'sections' ? 'topics' : 'notes';
    this.renderCharacter();
    this.sectionsColumn.replaceChildren(...this.leftColumn(depot));
    this.itemsColumn.replaceChildren(...this.rightColumn(depot, sections));
  }

  private renderCharacter(): void {
    const characters = this.deps.game.current.characters;
    if (!this.deps.canPickCharacter() || characters.length === 0) {
      this.characterSlot.replaceChildren();
      return;
    }
    const select = rememberedSelect(this.deps.memory, {
      key: CHARACTER_MEMORY_KEY,
      label: t.depot.character,
      options: characters.map((c) => ({ value: c.id, label: c.name })),
    });
    select.addEventListener('change', () => this.render());
    this.characterSlot.replaceChildren(
      el('label', { class: 'row__label' }, t.depot.character, select),
    );
  }

  // ---------------------------------------------------------------- left column

  /** The group's depot, then the private areas this viewer may open. */
  private areas(depot: Depot): Area[] {
    const shared: Area = { ownerId: null, title: t.depot.shared, hint: t.depot.sharedHint };
    const viewer = this.deps.depot.viewer;
    if (viewer.role === 'player') {
      if (!viewer.characterId) return [shared];
      return [
        shared,
        { ownerId: viewer.characterId, title: t.depot.myArea, hint: t.depot.privateHint },
      ];
    }
    // The master sees every character's area, and areas of characters since removed.
    const characters = this.deps.game.current.characters.map((c) => c.id);
    const owners = [
      ...characters,
      ...privateOwners(depot).filter((id) => !characters.includes(id)),
    ];
    return [
      shared,
      ...owners.map((ownerId) => ({
        ownerId,
        title: t.depot.privateArea(this.authorName(ownerId)),
        hint: t.depot.privateHintMaster,
      })),
    ];
  }

  private leftColumn(depot: Depot): HTMLElement[] {
    const trashCount = trashedSections(depot).length + trashedItems(depot).length;
    const viewer = this.deps.depot.viewer;
    return [
      ...this.areas(depot).flatMap((area) => this.areaBlock(depot, area)),
      ...(viewer.role === 'player' && !viewer.characterId
        ? [el('p', { class: 'panel__hint' }, t.depot.noArea)]
        : []),
      el(
        'button',
        {
          class: `archive__trash-link${this.pane.kind === 'trash' ? ' is-current' : ''}`,
          type: 'button',
          onclick: () => this.showPane({ kind: 'trash' }),
        },
        t.depot.trash(trashCount),
      ),
    ];
  }

  private areaBlock(depot: Depot, area: Area): HTMLElement[] {
    const sections = activeSections(depot, area.ownerId);
    const empty = area.ownerId === null ? t.depot.noSections : t.depot.noPrivateSections;
    return [
      el(
        'div',
        { class: 'row archive__topics-bar' },
        el('h3', { class: 'section-title' }, area.title),
        button(t.depot.newSection, () => this.editSection(null, area)),
      ),
      el('p', { class: 'panel__hint depot__area-hint' }, area.hint),
      sections.length === 0
        ? el('p', { class: 'panel__hint' }, empty)
        : el(
            'ul',
            { class: 'archive__topic-items' },
            ...sections.map((s) => this.sectionItem(s, sectionItems(depot, s.id).length)),
          ),
    ];
  }

  private sectionItem(section: DepotSection, count: number): HTMLElement {
    const isCurrent = section.id === this.sectionId && this.pane.kind !== 'trash';
    return el(
      'li',
      {},
      el(
        'button',
        {
          class: 'archive__topic',
          type: 'button',
          'aria-current': isCurrent ? 'true' : undefined,
          onclick: () => this.selectSection(section.id),
        },
        el('span', { class: 'archive__topic-name' }, sectionName(section)),
        el('span', { class: 'archive__count' }, String(count)),
      ),
    );
  }

  // ---------------------------------------------------------------- right column

  private rightColumn(depot: Depot, sections: readonly DepotSection[]): HTMLElement[] {
    const back = el(
      'button',
      { class: 'btn archive__back', type: 'button', onclick: () => this.goToSections() },
      t.depot.backToSections,
    );
    if (this.pane.kind === 'editor') return [back, this.pane.node];
    if (this.search.value.trim()) return [back, ...this.searchResults(depot, sections)];
    if (this.pane.kind === 'trash') return [back, ...this.trash(depot)];
    const section = sections.find((s) => s.id === this.sectionId);
    if (!section) return [back, el('p', { class: 'panel__hint' }, t.depot.pickSection)];
    return [
      back,
      this.sectionHeader(section),
      this.itemList(sectionItems(depot, section.id), sections),
    ];
  }

  private sectionHeader(section: DepotSection): HTMLElement {
    const area = section.ownerId === null ? null : this.areaLabel(section.ownerId);
    return el(
      'header',
      { class: 'archive__topic-header' },
      el('h3', { class: 'archive__topic-title' }, sectionName(section)),
      area && el('p', { class: 'panel__hint' }, `🔒 ${area}`),
      el(
        'div',
        { class: 'row row--wrap' },
        button(t.depot.newItem, () => this.editItem(null), { primary: true }),
        button(t.depot.renameSection, () => this.editSection(section, null)),
        button(
          '↑',
          () => void this.run({ type: 'section_shift', sectionId: section.id, direction: 'up' }),
          { title: t.depot.moveUp },
        ),
        button(
          '↓',
          () => void this.run({ type: 'section_shift', sectionId: section.id, direction: 'down' }),
          { title: t.depot.moveDown },
        ),
        confirmButton(
          t.depot.removeSection,
          () => void this.run({ type: 'section_remove', sectionId: section.id }),
        ),
      ),
    );
  }

  private itemList(
    items: readonly DepotItem[],
    sections: readonly DepotSection[],
    withSectionLabel = false,
  ): HTMLElement {
    if (items.length === 0) return el('p', { class: 'panel__hint' }, t.depot.emptySection);
    const byId = new Map(sections.map((section) => [section.id, section]));
    return el(
      'ul',
      { class: 'archive__note-list' },
      ...items.map((item) => {
        const section = byId.get(item.sectionId);
        return itemCard(item, {
          isExpanded: this.expanded.has(item.id),
          moveTargets: this.moveTargets(sections, item.sectionId),
          authorName: (id) => this.authorName(id),
          sectionLabel: withSectionLabel && section ? this.targetLabel(section) : undefined,
          isPrivate: section !== undefined && section.ownerId !== null,
          links: this.linksOf(item.id),
          onToggle: () => this.toggle(item.id),
          onEdit: () => this.editItem(item),
          onAdjust: (delta) => void this.run({ type: 'item_adjust', itemId: item.id, delta }),
          onMove: (sectionId) => void this.run({ type: 'item_move', itemId: item.id, sectionId }),
          onShift: (direction) => void this.run({ type: 'item_shift', itemId: item.id, direction }),
          onRemove: () => void this.run({ type: 'item_remove', itemId: item.id }),
        });
      }),
    );
  }

  /** What in the garden and the lab uses the item, read from the game. */
  private linksOf(itemId: string): string[] {
    const state = this.deps.game.current;
    const links = itemLinks(state, itemId);
    return hasLinks(links) ? linkLabels(state, links, depotSnapshot(this.deps.depot.current)) : [];
  }

  /** Every other section in use, the private ones labelled with their area. */
  private moveTargets(sections: readonly DepotSection[], currentId: string): MoveTarget[] {
    return sections
      .filter((section) => section.id !== currentId)
      .sort((a, b) => Number(a.ownerId !== null) - Number(b.ownerId !== null))
      .map((section) => ({ id: section.id, label: this.targetLabel(section) }));
  }

  private targetLabel(section: DepotSection): string {
    const name = sectionName(section);
    return section.ownerId === null ? name : `${name} (${this.areaLabel(section.ownerId)})`;
  }

  private areaLabel(ownerId: string): string {
    const viewer = this.deps.depot.viewer;
    const isMine = viewer.role === 'player' && viewer.characterId === ownerId;
    return isMine ? t.depot.myArea : t.depot.privateArea(this.authorName(ownerId));
  }

  private searchResults(depot: Depot, sections: readonly DepotSection[]): HTMLElement[] {
    const found = searchItems(depot, this.search.value);
    return [
      el('p', { class: 'panel__hint' }, t.depot.searchResults(found.length)),
      this.itemList(found, sections, true),
    ];
  }

  private trash(depot: Depot): HTMLElement[] {
    const byId = new Map(depot.sections.map((section) => [section.id, section]));
    return depotTrashView({
      sections: trashedSections(depot),
      items: trashedItems(depot),
      sectionNameOf: (id) => {
        const section = byId.get(id);
        return section ? this.targetLabel(section) : '';
      },
      isMaster: this.deps.depot.viewer.role === 'master',
      onRestoreSection: (sectionId) => void this.run({ type: 'section_restore', sectionId }),
      onRestoreItem: (itemId) => void this.run({ type: 'item_restore', itemId }),
      onEmpty: () => void this.run({ type: 'trash_empty' }),
    });
  }

  // ---------------------------------------------------------------- actions

  private authorName(authorId: string): string {
    if (authorId === MASTER_AUTHOR) return MASTER_ACTOR;
    return this.deps.game.current.characters.find((c) => c.id === authorId)?.name ?? authorId;
  }

  private run(command: DepotCommand): Promise<boolean> {
    return this.deps.depot.dispatch(command);
  }

  private selectSection(sectionId: string): void {
    this.sectionId = sectionId;
    this.deps.memory.set(SECTION_MEMORY_KEY, sectionId);
    this.search.value = '';
    this.showPane({ kind: 'section' });
  }

  private showPane(pane: Pane): void {
    this.pane = pane;
    this.step = 'items';
    this.render();
  }

  private goToSections(): void {
    this.step = 'sections';
    this.render();
  }

  private closeEditor(): void {
    this.showPane({ kind: 'section' });
  }

  private toggle(itemId: string): void {
    if (this.expanded.has(itemId)) this.expanded.delete(itemId);
    else this.expanded.add(itemId);
    this.render();
  }

  /** `area` is where a new section goes; null when editing one. */
  private editSection(section: DepotSection | null, area: Area | null): void {
    const ownerId = section?.ownerId ?? area?.ownerId ?? null;
    const node = sectionEditor({
      section,
      areaLabel: ownerId === null ? t.depot.shared : `🔒 ${this.areaLabel(ownerId)}`,
      onCancel: () => this.closeEditor(),
      onSave: async ({ name, icon }) => {
        const id = section?.id ?? newId('section');
        const command: DepotCommand = section
          ? { type: 'section_update', sectionId: id, name, icon }
          : { type: 'section_create', id, ownerId, name, icon };
        if (!(await this.run(command))) return;
        this.sectionId = id;
        this.deps.memory.set(SECTION_MEMORY_KEY, id);
        this.closeEditor();
      },
    });
    this.showPane({ kind: 'editor', node });
  }

  private editItem(item: DepotItem | null): void {
    const sectionId = this.sectionId;
    if (!sectionId) return;
    const node = itemEditor({
      item,
      onCancel: () => this.closeEditor(),
      onSave: async (fields) => {
        const id = item?.id ?? newId('item');
        const command: DepotCommand = item
          ? { type: 'item_update', itemId: id, ...fields }
          : { type: 'item_create', id, sectionId, ...fields };
        if (!(await this.run(command))) return;
        this.closeEditor();
      },
    });
    this.showPane({ kind: 'editor', node });
  }
}
