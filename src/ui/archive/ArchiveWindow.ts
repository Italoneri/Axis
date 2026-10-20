import type { ArchiveStore } from '../../archiveStore';
import { newId } from '../../commands/newId';
import { MASTER_ACTOR } from '../../commands/applyCommand';
import { t } from '../../i18n/pt-BR';
import type { GameStore } from '../../store';
import {
  activeTopics,
  MASTER_AUTHOR,
  searchNotes,
  topicNotes,
  topicPath,
  topicTree,
  trashedNotes,
  trashedTopics,
  type Archive,
  type ArchiveCommand,
  type ArchiveNote,
  type ArchiveTopic,
  type NoteFields,
  type TopicNode,
} from '../../systems/Archive';
import { el } from '../dom';
import type { UiMemory } from '../uiMemory';
import { button, confirmButton, rememberedSelect } from '../widgets';
import { attachmentsEditor } from './imageAttachments';
import { openImageViewer } from './imageViews';
import {
  noteCard,
  noteEditor,
  pasteEditor,
  topicEditor,
  topicName,
  trashView,
  type TopicChoice,
} from './archiveViews';

const TOPIC_MEMORY_KEY = 'archive.topic';
export const CHARACTER_MEMORY_KEY = 'archive.character';

export interface ArchiveWindowDeps {
  archive: ArchiveStore;
  game: GameStore;
  memory: UiMemory;
  /** Offline players pick who they are (as for deposits); online the login decides. */
  canPickCharacter: () => boolean;
  notify: (message: string, tone?: 'error') => void;
}

/** What the right column shows besides the notes of the chosen topic. */
type Pane =
  | { kind: 'topic' }
  | { kind: 'trash' }
  /** Editors are built once and kept across re-renders, so typing is never lost. */
  | { kind: 'editor'; node: HTMLElement };

/**
 * "Arquivo de registros": a near full screen <dialog> with topics on the left
 * and the chosen topic's notes on the right (two steps on phones).
 */
export class ArchiveWindow {
  private dialog: HTMLDialogElement | null = null;
  private topicId: string | null = null;
  private pane: Pane = { kind: 'topic' };
  /** Phones show one column at a time. */
  private step: 'topics' | 'notes' = 'topics';
  private readonly expanded = new Set<string>();
  /** Topics whose sub-topics show in the tree. */
  private readonly openTopics = new Set<string>();
  /** Files uploaded by the open note editor and not saved yet. */
  private dropUnsaved: (() => Promise<void>) | null = null;
  private readonly cleanups: (() => void)[] = [];
  private readonly search = el('input', {
    class: 'input input--wide',
    type: 'search',
    placeholder: t.archive.search,
    'aria-label': t.archive.search,
  });
  private readonly characterSlot = el('div', { class: 'archive__character' });
  private readonly topicsColumn = el('div', { class: 'archive__topic-list' });
  private readonly notesColumn = el('section', { class: 'archive__notes' });
  private readonly layout = el('div', { class: 'archive' });

  constructor(private readonly deps: ArchiveWindowDeps) {
    this.search.addEventListener('input', () => {
      if (this.search.value.trim()) this.step = 'notes';
      this.render();
    });
  }

  open(): void {
    if (this.dialog) return;
    this.topicId = this.deps.memory.get(TOPIC_MEMORY_KEY) ?? null;
    if (this.topicId) this.revealTopic(this.topicId);
    this.pane = { kind: 'topic' };
    this.step = this.topicId ? 'notes' : 'topics';
    const dialog = this.buildDialog();
    this.dialog = dialog;
    this.cleanups.push(
      this.deps.archive.subscribe(() => this.render()),
      this.deps.game.subscribe(() => this.render()),
    );
    document.body.append(dialog);
    this.render();
    dialog.showModal();
    // Realtime may have missed something while the window was closed.
    void this.deps.archive.reload();
  }

  private buildDialog(): HTMLDialogElement {
    const dialog = el(
      'dialog',
      { class: 'dialog dialog--archive', 'aria-label': t.archive.title },
      el(
        'header',
        { class: 'archive__header' },
        el('h2', { class: 'panel__title' }, t.archive.title),
        this.characterSlot,
        el(
          'button',
          {
            class: 'btn btn--icon',
            type: 'button',
            'aria-label': t.archive.close,
            onclick: () => dialog.close(),
          },
          '×',
        ),
      ),
      // Outside the columns: on phones it stays visible while the results show.
      el('div', { class: 'archive__searchbar' }, this.search),
      this.layout,
    );
    this.layout.replaceChildren(
      el('aside', { class: 'archive__topics' }, this.topicsColumn),
      this.notesColumn,
    );
    // Esc closes the dialog; the slot panel behind it should stay open.
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') event.stopPropagation();
    });
    dialog.addEventListener('close', () => {
      this.dropUnsavedImages();
      this.cleanups.splice(0).forEach((cleanup) => cleanup());
      dialog.remove();
      this.dialog = null;
    });
    return dialog;
  }

  private render(): void {
    if (!this.dialog) return;
    const archive = this.deps.archive.current;
    const topics = activeTopics(archive);
    if (this.topicId && !topics.some((topic) => topic.id === this.topicId)) this.topicId = null;
    this.layout.dataset.step = this.step;
    this.renderCharacter();
    this.topicsColumn.replaceChildren(...this.topicItems(archive));
    this.notesColumn.replaceChildren(...this.rightColumn(archive, topics));
  }

  private renderCharacter(): void {
    const characters = this.deps.game.current.characters;
    if (!this.deps.canPickCharacter() || characters.length === 0) {
      this.characterSlot.replaceChildren();
      return;
    }
    const select = rememberedSelect(this.deps.memory, {
      key: CHARACTER_MEMORY_KEY,
      label: t.archive.character,
      options: characters.map((c) => ({ value: c.id, label: c.name })),
    });
    select.addEventListener('change', () => this.render());
    this.characterSlot.replaceChildren(
      el('label', { class: 'row__label' }, t.archive.character, select),
    );
  }

  // ---------------------------------------------------------------- left column

  private topicItems(archive: Archive): HTMLElement[] {
    const trashCount = trashedTopics(archive).length + trashedNotes(archive).length;
    const tree = topicTree(archive);
    const ownCounts = new Map(
      activeTopics(archive).map((topic) => [topic.id, topicNotes(archive, topic.id).length]),
    );
    const list =
      tree.length === 0
        ? el('p', { class: 'panel__hint' }, t.archive.noTopics)
        : this.topicBranch(tree, ownCounts, 'archive__topic-items');
    return [
      el(
        'div',
        { class: 'row archive__topics-bar' },
        el('h3', { class: 'section-title' }, t.archive.topics),
        button(t.archive.newTopic, () => this.editTopic(null, null)),
      ),
      list,
      el(
        'button',
        {
          class: `archive__trash-link${this.pane.kind === 'trash' ? ' is-current' : ''}`,
          type: 'button',
          onclick: () => this.showPane({ kind: 'trash' }),
        },
        t.archive.trash(trashCount),
      ),
    ];
  }

  private topicBranch(
    nodes: readonly TopicNode[],
    ownCounts: ReadonlyMap<string, number>,
    className: string,
  ): HTMLElement {
    return el('ul', { class: className }, ...nodes.map((node) => this.topicItem(node, ownCounts)));
  }

  private topicItem(node: TopicNode, ownCounts: ReadonlyMap<string, number>): HTMLElement {
    const { topic, children } = node;
    const isCurrent = topic.id === this.topicId && this.pane.kind !== 'trash';
    const isOpen = this.openTopics.has(topic.id);
    const name = topicName(topic);
    return el(
      'li',
      {},
      el(
        'div',
        { class: 'archive__topic-row' },
        children.length > 0
          ? el(
              'button',
              {
                class: 'archive__topic-toggle',
                type: 'button',
                'aria-expanded': String(isOpen),
                'aria-label': isOpen ? t.archive.collapseTopic(name) : t.archive.expandTopic(name),
                onclick: () => this.toggleTopic(topic.id),
              },
              isOpen ? '▾' : '▸',
            )
          : el('span', { class: 'archive__topic-toggle', 'aria-hidden': 'true' }),
        el(
          'button',
          {
            class: 'archive__topic',
            type: 'button',
            'aria-current': isCurrent ? 'true' : undefined,
            onclick: () => this.selectTopic(topic.id),
          },
          el('span', { class: 'archive__topic-name' }, name),
          el('span', { class: 'archive__count' }, String(subtreeCount(node, ownCounts))),
        ),
      ),
      isOpen && children.length > 0 && this.topicBranch(children, ownCounts, 'archive__subtopics'),
    );
  }

  // ---------------------------------------------------------------- right column

  private rightColumn(archive: Archive, topics: readonly ArchiveTopic[]): HTMLElement[] {
    const back = el(
      'button',
      { class: 'btn archive__back', type: 'button', onclick: () => this.goToTopics() },
      t.archive.backToTopics,
    );
    if (this.pane.kind === 'editor') return [back, this.pane.node];
    if (this.search.value.trim()) return [back, ...this.searchResults(archive)];
    if (this.pane.kind === 'trash') return [back, ...this.trash(archive)];
    const topic = topics.find((item) => item.id === this.topicId);
    if (!topic) return [back, el('p', { class: 'panel__hint' }, t.archive.pickTopic)];
    return [back, this.topicHeader(archive, topic), this.noteList(topicNotes(archive, topic.id))];
  }

  private topicHeader(archive: Archive, topic: ArchiveTopic): HTMLElement {
    const above = topicPath(archive, topic.id).slice(0, -1).map(topicName);
    return el(
      'header',
      { class: 'archive__topic-header' },
      above.length > 0 && el('p', { class: 'archive__topic-path' }, t.archive.topicPath(above)),
      el('h3', { class: 'archive__topic-title' }, topicName(topic)),
      el(
        'div',
        { class: 'row row--wrap' },
        button(t.archive.newNote, () => this.editNote(null), { primary: true }),
        button(t.archive.paste, () => this.pasteInto(topic)),
        button(t.archive.newSubtopic, () => this.editTopic(null, topic.id)),
        button(t.archive.renameTopic, () => this.editTopic(topic, topic.parentId)),
        button(
          '↑',
          () => void this.run({ type: 'topic_shift', topicId: topic.id, direction: 'up' }),
          { title: t.archive.moveUp },
        ),
        button(
          '↓',
          () => void this.run({ type: 'topic_shift', topicId: topic.id, direction: 'down' }),
          { title: t.archive.moveDown },
        ),
        confirmButton(
          t.archive.removeTopic,
          () => void this.run({ type: 'topic_remove', topicId: topic.id }),
        ),
      ),
    );
  }

  /** `topicPaths` labels each note with its topic (search results). */
  private noteList(
    notes: readonly ArchiveNote[],
    topicPaths?: ReadonlyMap<string, string>,
  ): HTMLElement {
    if (notes.length === 0) return el('p', { class: 'panel__hint' }, t.archive.emptyTopic);
    return el(
      'ul',
      { class: 'archive__note-list' },
      ...notes.map((note) =>
        noteCard(note, {
          isExpanded: this.expanded.has(note.id),
          authorName: (id) => this.authorName(id),
          topicLabel: topicPaths?.get(note.topicId),
          onToggle: () => this.toggle(note.id),
          onEdit: () => this.editNote(note),
          onShift: (direction) => void this.run({ type: 'note_shift', noteId: note.id, direction }),
          images: {
            url: (image, variant) => this.deps.archive.imageUrl(note.id, image, variant),
            open: (index) =>
              openImageViewer(note.images, index, (image) =>
                this.deps.archive.imageUrl(note.id, image, 'full'),
              ),
          },
        }),
      ),
    );
  }

  private searchResults(archive: Archive): HTMLElement[] {
    const found = searchNotes(archive, this.search.value);
    const paths = new Map(topicChoices(topicTree(archive)).map(({ id, path }) => [id, path]));
    return [
      el('p', { class: 'panel__hint' }, t.archive.searchResults(found.length)),
      this.noteList(found, paths),
    ];
  }

  private trash(archive: Archive): HTMLElement[] {
    const names = new Map([
      ...archive.topics.map((topic): [string, string] => [topic.id, topicName(topic)]),
      // Topics in use read with their whole path.
      ...topicChoices(topicTree(archive)).map(({ id, path }): [string, string] => [id, path]),
    ]);
    return trashView({
      topics: trashedTopics(archive),
      notes: trashedNotes(archive),
      topicNameOf: (id) => names.get(id) ?? '',
      isMaster: this.isMaster,
      onRestoreTopic: (topicId) => void this.run({ type: 'topic_restore', topicId }),
      onRestoreNote: (noteId) => void this.run({ type: 'note_restore', noteId }),
      onEmpty: () => void this.run({ type: 'trash_empty' }),
    });
  }

  // ---------------------------------------------------------------- actions

  private get isMaster(): boolean {
    return this.deps.archive.viewer.role === 'master';
  }

  private authorName(authorId: string): string {
    if (authorId === MASTER_AUTHOR) return MASTER_ACTOR;
    return this.deps.game.current.characters.find((c) => c.id === authorId)?.name ?? authorId;
  }

  private run(command: ArchiveCommand): Promise<boolean> {
    return this.deps.archive.dispatch(command);
  }

  private selectTopic(topicId: string): void {
    this.focusTopic(topicId);
    this.openTopics.add(topicId);
    this.search.value = '';
    this.showPane({ kind: 'topic' });
  }

  /** Makes `topicId` the topic shown, with the tree open down to it. */
  private focusTopic(topicId: string): void {
    this.topicId = topicId;
    this.deps.memory.set(TOPIC_MEMORY_KEY, topicId);
    this.revealTopic(topicId);
  }

  private revealTopic(topicId: string): void {
    const above = topicPath(this.deps.archive.current, topicId).slice(0, -1);
    above.forEach((topic) => this.openTopics.add(topic.id));
  }

  private toggleTopic(topicId: string): void {
    if (this.openTopics.has(topicId)) this.openTopics.delete(topicId);
    else this.openTopics.add(topicId);
    this.render();
  }

  private showPane(pane: Pane): void {
    if (pane.kind !== 'editor') this.dropUnsavedImages();
    this.pane = pane;
    this.step = 'notes';
    this.render();
  }

  private goToTopics(): void {
    this.step = 'topics';
    this.render();
  }

  private closeEditor(): void {
    this.showPane({ kind: 'topic' });
  }

  private toggle(noteId: string): void {
    if (this.expanded.has(noteId)) this.expanded.delete(noteId);
    else this.expanded.add(noteId);
    this.render();
  }

  private editTopic(topic: ArchiveTopic | null, parentId: string | null): void {
    // Neither the topic itself nor anything below it can hold it.
    const skip = new Set(topic ? [topic.id] : []);
    const node = topicEditor({
      topic,
      parentId,
      parents: topicChoices(topicTree(this.deps.archive.current), skip),
      onCancel: () => this.closeEditor(),
      onSave: async (fields) => {
        const id = topic?.id ?? newId('topic');
        const command: ArchiveCommand = topic
          ? { type: 'topic_update', topicId: id, ...fields }
          : { type: 'topic_create', id, ...fields };
        if (!(await this.run(command))) return;
        this.focusTopic(id);
        this.closeEditor();
      },
    });
    this.showPane({ kind: 'editor', node });
  }

  private editNote(note: ArchiveNote | null): void {
    const topicId = note?.topicId ?? this.topicId;
    if (!topicId) return;
    this.dropUnsavedImages();
    // Known before saving: images are uploaded under the note while it is edited.
    const id = note?.id ?? newId('note');
    const attachments = attachmentsEditor({
      noteId: id,
      saved: note?.images ?? [],
      archive: this.deps.archive,
      notify: this.deps.notify,
      removeSaved: (imageId) => this.run({ type: 'note_image_remove', noteId: id, imageId }),
    });
    this.dropUnsaved = () => attachments.discardUnsaved();
    const node = noteEditor({
      note,
      day: this.deps.game.current.day,
      isMaster: this.isMaster,
      topicId,
      topics: topicChoices(topicTree(this.deps.archive.current)),
      attachments,
      onCancel: () => this.closeEditor(),
      onRemove: async () => {
        if (await this.run({ type: 'note_remove', noteId: id })) this.closeEditor();
      },
      onSave: async (fields, targetId) => {
        if (!(await this.saveNote(note, id, fields, targetId))) return;
        this.dropUnsaved = null;
        this.expanded.add(id);
        if (targetId !== topicId) this.focusTopic(targetId);
        this.closeEditor();
      },
    });
    this.showPane({ kind: 'editor', node });
  }

  /** The move only applies once the edit is saved, so a refused edit moves nothing. */
  private async saveNote(
    note: ArchiveNote | null,
    id: string,
    fields: NoteFields,
    topicId: string,
  ): Promise<boolean> {
    if (!note) return this.run({ type: 'note_create', id, topicId, ...fields });
    if (!(await this.run({ type: 'note_update', noteId: id, ...fields }))) return false;
    return note.topicId === topicId || this.run({ type: 'note_move', noteId: id, topicId });
  }

  private dropUnsavedImages(): void {
    const drop = this.dropUnsaved;
    this.dropUnsaved = null;
    if (drop) void drop();
  }

  private pasteInto(topic: ArchiveTopic): void {
    const node = pasteEditor({
      isMaster: this.isMaster,
      existingTitles: this.deps.archive.current.notes
        .filter((note) => note.topicId === topic.id)
        .map((note) => note.title),
      onCancel: () => this.closeEditor(),
      onSave: async (records, visibility) => {
        const command: ArchiveCommand = {
          type: 'notes_paste',
          topicId: topic.id,
          day: this.deps.game.current.day,
          visibility,
          notes: records.map(({ title, body }) => ({ id: newId('note'), title, body })),
        };
        if (await this.run(command)) this.closeEditor();
      },
    });
    this.showPane({ kind: 'editor', node });
  }
}

function subtreeCount(node: TopicNode, ownCounts: ReadonlyMap<string, number>): number {
  return node.children.reduce(
    (sum, child) => sum + subtreeCount(child, ownCounts),
    ownCounts.get(node.topic.id) ?? 0,
  );
}

/** Every topic of the tree in reading order, labeled with its path; `skip` leaves out whole branches. */
function topicChoices(
  nodes: readonly TopicNode[],
  skip: ReadonlySet<string> = new Set(),
  above: readonly string[] = [],
): TopicChoice[] {
  return nodes.flatMap((node) => {
    if (skip.has(node.topic.id)) return [];
    const path = [...above, topicName(node.topic)];
    return [
      { id: node.topic.id, path: t.archive.topicPath(path) },
      ...topicChoices(node.children, skip, path),
    ];
  });
}
