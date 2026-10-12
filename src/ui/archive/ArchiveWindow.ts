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
  trashedNotes,
  trashedTopics,
  type Archive,
  type ArchiveCommand,
  type ArchiveNote,
  type ArchiveTopic,
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
    this.topicsColumn.replaceChildren(...this.topicItems(archive, topics));
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

  private topicItems(archive: Archive, topics: readonly ArchiveTopic[]): HTMLElement[] {
    const trashCount = trashedTopics(archive).length + trashedNotes(archive).length;
    const list =
      topics.length === 0
        ? el('p', { class: 'panel__hint' }, t.archive.noTopics)
        : el(
            'ul',
            { class: 'archive__topic-items' },
            ...topics.map((topic) => this.topicItem(topic, topicNotes(archive, topic.id).length)),
          );
    return [
      el(
        'div',
        { class: 'row archive__topics-bar' },
        el('h3', { class: 'section-title' }, t.archive.topics),
        button(t.archive.newTopic, () => this.editTopic(null)),
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

  private topicItem(topic: ArchiveTopic, count: number): HTMLElement {
    const isCurrent = topic.id === this.topicId && this.pane.kind !== 'trash';
    return el(
      'li',
      {},
      el(
        'button',
        {
          class: 'archive__topic',
          type: 'button',
          'aria-current': isCurrent ? 'true' : undefined,
          onclick: () => this.selectTopic(topic.id),
        },
        el('span', { class: 'archive__topic-name' }, topicName(topic)),
        el('span', { class: 'archive__count' }, String(count)),
      ),
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
    if (this.search.value.trim()) return [back, ...this.searchResults(archive, topics)];
    if (this.pane.kind === 'trash') return [back, ...this.trash(archive)];
    const topic = topics.find((item) => item.id === this.topicId);
    if (!topic) return [back, el('p', { class: 'panel__hint' }, t.archive.pickTopic)];
    return [back, this.topicHeader(topic), this.noteList(topicNotes(archive, topic.id), topics)];
  }

  private topicHeader(topic: ArchiveTopic): HTMLElement {
    return el(
      'header',
      { class: 'archive__topic-header' },
      el('h3', { class: 'archive__topic-title' }, topicName(topic)),
      el(
        'div',
        { class: 'row row--wrap' },
        button(t.archive.newNote, () => this.editNote(null), { primary: true }),
        button(t.archive.paste, () => this.pasteInto(topic)),
        button(t.archive.renameTopic, () => this.editTopic(topic)),
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

  private noteList(
    notes: readonly ArchiveNote[],
    topics: readonly ArchiveTopic[],
    withTopicLabel = false,
  ): HTMLElement {
    if (notes.length === 0) return el('p', { class: 'panel__hint' }, t.archive.emptyTopic);
    const nameOf = new Map(topics.map((topic) => [topic.id, topicName(topic)]));
    return el(
      'ul',
      { class: 'archive__note-list' },
      ...notes.map((note) =>
        noteCard(note, {
          isExpanded: this.expanded.has(note.id),
          otherTopics: topics.filter((topic) => topic.id !== note.topicId),
          authorName: (id) => this.authorName(id),
          topicLabel: withTopicLabel ? nameOf.get(note.topicId) : undefined,
          onToggle: () => this.toggle(note.id),
          onEdit: () => this.editNote(note),
          onMove: (topicId) => void this.run({ type: 'note_move', noteId: note.id, topicId }),
          onShift: (direction) => void this.run({ type: 'note_shift', noteId: note.id, direction }),
          onRemove: () => void this.run({ type: 'note_remove', noteId: note.id }),
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

  private searchResults(archive: Archive, topics: readonly ArchiveTopic[]): HTMLElement[] {
    const found = searchNotes(archive, this.search.value);
    return [
      el('p', { class: 'panel__hint' }, t.archive.searchResults(found.length)),
      this.noteList(found, topics, true),
    ];
  }

  private trash(archive: Archive): HTMLElement[] {
    const names = new Map(archive.topics.map((topic) => [topic.id, topicName(topic)]));
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
    this.topicId = topicId;
    this.deps.memory.set(TOPIC_MEMORY_KEY, topicId);
    this.search.value = '';
    this.showPane({ kind: 'topic' });
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

  private editTopic(topic: ArchiveTopic | null): void {
    const node = topicEditor({
      topic,
      onCancel: () => this.closeEditor(),
      onSave: async ({ name, icon }) => {
        const id = topic?.id ?? newId('topic');
        const command: ArchiveCommand = topic
          ? { type: 'topic_update', topicId: id, name, icon }
          : { type: 'topic_create', id, name, icon };
        if (!(await this.run(command))) return;
        this.topicId = id;
        this.deps.memory.set(TOPIC_MEMORY_KEY, id);
        this.closeEditor();
      },
    });
    this.showPane({ kind: 'editor', node });
  }

  private editNote(note: ArchiveNote | null): void {
    const topicId = this.topicId;
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
      attachments,
      onCancel: () => this.closeEditor(),
      onSave: async (fields) => {
        const command: ArchiveCommand = note
          ? { type: 'note_update', noteId: id, ...fields }
          : { type: 'note_create', id, topicId, ...fields };
        if (!(await this.run(command))) return;
        this.dropUnsaved = null;
        this.expanded.add(id);
        this.closeEditor();
      },
    });
    this.showPane({ kind: 'editor', node });
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
