import { t } from '../../i18n/pt-BR';
import {
  BODY_LIMIT,
  TITLE_LIMIT,
  type ArchiveNote,
  type ArchiveTopic,
  type NoteFields,
  type NoteVisibility,
} from '../../systems/Archive';
import { splitPastedRecords, type PastedRecord } from '../../systems/ArchivePaste';
import { el } from '../dom';
import { button, confirmButton, field, selectInput } from '../widgets';
import type { AttachmentsEditor } from './imageAttachments';
import { imageStrip, type ImageStripDeps } from './imageViews';
import { renderMarkdown } from './markdownView';

// Pieces of the archive window: note cards, the note and paste editors, the trash.

export interface NoteCardDeps {
  isExpanded: boolean;
  /** Topics the note can move to (in use, other than its own). */
  otherTopics: readonly ArchiveTopic[];
  authorName: (authorId: string) => string;
  /** Shown above the title in search results. */
  topicLabel?: string | undefined;
  onToggle: () => void;
  onEdit: () => void;
  onMove: (topicId: string) => void;
  onShift: (direction: 'up' | 'down') => void;
  onRemove: () => void;
  images: ImageStripDeps;
}

export function noteCard(note: ArchiveNote, deps: NoteCardDeps): HTMLElement {
  const isSecret = note.visibility === 'mestre';
  const author = deps.authorName(note.authorId);
  const editor = note.editedBy && deps.authorName(note.editedBy);
  return el(
    'li',
    { class: `archive-note${note.pinned ? ' archive-note--pinned' : ''}` },
    el(
      'button',
      {
        class: 'archive-note__toggle',
        type: 'button',
        'aria-expanded': String(deps.isExpanded),
        onclick: deps.onToggle,
      },
      deps.topicLabel && el('span', { class: 'archive-note__topic' }, deps.topicLabel),
      el(
        'span',
        { class: 'archive-note__title' },
        note.pinned && `${t.archive.pinnedBadge} `,
        note.title,
      ),
      el(
        'span',
        { class: 'archive-note__meta' },
        `${t.archive.day(note.day)} · ${t.archive.byline(author, editor || undefined)}`,
        note.images.length > 0 &&
          el('span', { class: 'archive-note__image-count' }, `🖼 ${note.images.length}`),
        isSecret && el('span', { class: 'archive-note__secret' }, t.archive.masterOnlyBadge),
      ),
    ),
    deps.isExpanded &&
      el(
        'div',
        { class: 'archive-note__body' },
        renderMarkdown(note.body),
        note.images.length > 0 && imageStrip(note.images, deps.images),
        noteActions(deps),
      ),
  );
}

function noteActions(deps: NoteCardDeps): HTMLElement {
  const moveSelect = selectInput({
    label: t.archive.moveTo,
    options: deps.otherTopics.map((topic) => ({ value: topic.id, label: topicName(topic) })),
    value: deps.otherTopics[0]?.id ?? '',
  });
  const canMove = deps.otherTopics.length > 0;
  return el(
    'div',
    { class: 'row row--wrap archive-note__actions' },
    button(t.archive.edit, deps.onEdit),
    button('↑', () => deps.onShift('up'), { title: t.archive.moveUp }),
    button('↓', () => deps.onShift('down'), { title: t.archive.moveDown }),
    canMove && moveSelect,
    canMove && button(t.archive.move, () => deps.onMove(moveSelect.value)),
    confirmButton(t.archive.remove, deps.onRemove),
  );
}

export function topicName(topic: Pick<ArchiveTopic, 'name' | 'icon'>): string {
  return topic.icon ? `${topic.icon} ${topic.name}` : topic.name;
}

// ---------------------------------------------------------------- note editor

export interface NoteEditorOptions {
  note: ArchiveNote | null;
  day: number;
  /** Only the master chooses who sees the note. */
  isMaster: boolean;
  /** The images section, which uploads as files arrive. */
  attachments: AttachmentsEditor;
  onSave: (fields: NoteFields) => void;
  onCancel: () => void;
}

/** Built once per edit, so a re-render of the window never wipes what is being typed. */
export function noteEditor({
  note,
  day,
  isMaster,
  attachments,
  onSave,
  onCancel,
}: NoteEditorOptions): HTMLElement {
  const title = el('input', {
    class: 'input input--wide',
    type: 'text',
    maxlength: String(TITLE_LIMIT),
    required: true,
    value: note?.title ?? '',
    'aria-label': t.archive.noteTitle,
  });
  const dayInput = el('input', {
    class: 'input',
    type: 'number',
    min: '0',
    step: '1',
    value: String(note?.day ?? day),
  });
  const pinned = el('input', { type: 'checkbox', checked: note?.pinned ?? false });
  const visibility = selectInput({
    label: t.archive.visibility,
    options: (['todos', 'mestre'] as const).map((value) => ({
      value,
      label: t.archive.visibilityOptions[value],
    })),
    value: note?.visibility ?? 'todos',
  });
  const body = el('textarea', { class: 'input archive-editor__text', rows: '14' });
  body.value = note?.body ?? '';
  const preview = el('div', { class: 'archive-editor__preview', hidden: true });
  const previewToggle = button(t.archive.preview, () => {
    const isPreviewing = !preview.hidden;
    preview.replaceChildren(...(isPreviewing ? [] : [renderMarkdown(body.value)]));
    preview.hidden = isPreviewing;
    body.hidden = !isPreviewing;
    previewToggle.textContent = isPreviewing ? t.archive.preview : t.archive.rawText;
  });

  const form = el(
    'form',
    { class: 'archive-editor' },
    field(t.archive.noteTitle, title),
    el(
      'div',
      { class: 'row row--wrap' },
      field(t.archive.noteDay, dayInput),
      isMaster && field(t.archive.visibility, visibility),
      el('label', { class: 'row__label' }, pinned, t.archive.notePinned),
    ),
    el(
      'div',
      { class: 'row archive-editor__bar' },
      el('span', {}, t.archive.noteBody),
      previewToggle,
    ),
    body,
    preview,
    attachments.element,
    el(
      'div',
      { class: 'row row--end' },
      button(t.archive.cancel, onCancel),
      el('button', { class: 'btn btn--primary', type: 'submit' }, t.archive.save),
    ),
  );
  attachments.listenOn(form);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    // The status line says images are still uploading.
    if (attachments.isBusy()) return;
    onSave({
      title: title.value,
      body: body.value,
      day: Math.max(0, Math.floor(Number(dayInput.value) || 0)),
      pinned: pinned.checked,
      visibility: isMaster ? parseVisibility(visibility.value) : (note?.visibility ?? 'todos'),
      images: attachments.images(),
    });
  });
  queueMicrotask(() => title.focus());
  return form;
}

function parseVisibility(value: string): NoteVisibility {
  return value === 'mestre' ? 'mestre' : 'todos';
}

// ---------------------------------------------------------------- paste

export interface PasteEditorOptions {
  isMaster: boolean;
  onSave: (records: readonly PastedRecord[], visibility: NoteVisibility) => void;
  onCancel: () => void;
}

/** "Colar registros": the big paste, then a preview of the notes it becomes. */
export function pasteEditor({ isMaster, onSave, onCancel }: PasteEditorOptions): HTMLElement {
  const text = el('textarea', { class: 'input archive-editor__text', rows: '16' });
  const visibility = selectInput({
    label: t.archive.visibility,
    options: (['todos', 'mestre'] as const).map((value) => ({
      value,
      label: t.archive.visibilityOptions[value],
    })),
    value: 'todos',
  });
  const root = el('div', { class: 'archive-editor' });

  const showText = () =>
    root.replaceChildren(
      el('p', { class: 'panel__hint' }, t.archive.pasteHint),
      text,
      el(
        'div',
        { class: 'row row--end' },
        button(t.archive.cancel, onCancel),
        button(t.archive.pastePreview, showPreview, { primary: true }),
      ),
    );

  const showPreview = () => {
    const records = splitPastedRecords(text.value);
    const isBlocked = records.length === 0 || records.some((r) => r.isTooLong);
    root.replaceChildren(
      records.length === 0
        ? el('p', { class: 'notice' }, t.archive.pasteEmpty)
        : el('ol', { class: 'archive-paste' }, ...records.map(pastedItem)),
      ...(isMaster ? [field(t.archive.visibility, visibility)] : []),
      el(
        'div',
        { class: 'row row--end' },
        button(t.archive.pasteBack, showText),
        button(
          t.archive.pasteSave(records.length),
          () => onSave(records, isMaster ? parseVisibility(visibility.value) : 'todos'),
          { primary: true, disabled: isBlocked },
        ),
      ),
    );
  };

  showText();
  queueMicrotask(() => text.focus());
  return root;
}

function pastedItem(record: PastedRecord): HTMLElement {
  return el(
    'li',
    { class: 'archive-paste__item' },
    el('strong', {}, record.title),
    el('span', { class: 'panel__hint' }, t.archive.pasteChars(record.body.length)),
    record.isTooLong && el('span', { class: 'notice' }, t.archive.pasteTooLong(BODY_LIMIT)),
  );
}

// ---------------------------------------------------------------- topic editor

export interface TopicEditorOptions {
  topic: ArchiveTopic | null;
  onSave: (fields: { name: string; icon: string }) => void;
  onCancel: () => void;
}

export function topicEditor({ topic, onSave, onCancel }: TopicEditorOptions): HTMLElement {
  const icon = el('input', {
    class: 'input archive-editor__icon',
    type: 'text',
    maxlength: '8',
    value: topic?.icon ?? '',
    placeholder: '📜',
  });
  const name = el('input', {
    class: 'input input--wide',
    type: 'text',
    maxlength: String(TITLE_LIMIT),
    required: true,
    value: topic?.name ?? '',
  });
  const form = el(
    'form',
    { class: 'archive-editor' },
    el('div', { class: 'row' }, field(t.archive.topicIcon, icon), field(t.archive.topicName, name)),
    el(
      'div',
      { class: 'row row--end' },
      button(t.archive.cancel, onCancel),
      el(
        'button',
        { class: 'btn btn--primary', type: 'submit' },
        topic ? t.archive.saveTopic : t.archive.createTopic,
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

export interface TrashViewOptions {
  topics: readonly ArchiveTopic[];
  notes: readonly ArchiveNote[];
  topicNameOf: (topicId: string) => string;
  isMaster: boolean;
  onRestoreTopic: (topicId: string) => void;
  onRestoreNote: (noteId: string) => void;
  onEmpty: () => void;
}

export function trashView(options: TrashViewOptions): HTMLElement[] {
  const rows = [
    ...options.topics.map((topic) =>
      trashRow(t.archive.trashedTopic(topicName(topic)), () => options.onRestoreTopic(topic.id)),
    ),
    ...options.notes.map((note) =>
      trashRow(t.archive.trashedNote(note.title, options.topicNameOf(note.topicId)), () =>
        options.onRestoreNote(note.id),
      ),
    ),
  ];
  return [
    el('h3', { class: 'section-title' }, t.archive.trashTitle),
    el('p', { class: 'panel__hint' }, t.archive.trashHint),
    rows.length === 0
      ? el('p', { class: 'panel__hint' }, t.archive.trashEmpty)
      : el('ul', { class: 'item-list' }, ...rows),
    ...(options.isMaster && rows.length > 0
      ? [el('div', { class: 'row row--end' }, confirmButton(t.archive.emptyTrash, options.onEmpty))]
      : []),
  ];
}

function trashRow(label: string, onRestore: () => void): HTMLElement {
  return el(
    'li',
    { class: 'item-row' },
    el('span', { class: 'item-row__name' }, label),
    button(t.archive.restore, onRestore),
  );
}
