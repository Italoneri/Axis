import { z } from 'zod';
import type { Actor } from '../commands/schema';
import type { ArchiveChange } from '../model/schema';

// Arquivo de registros: topics and notes kept outside the GameState (see
// docs/plans/ARQUIVO.md). Pure rules, run the same way offline and online.

/** Building whose side panel opens the records once built. */
export const ARCHIVE_BUILDING_ID = 'archive';
export const TITLE_LIMIT = 200;
export const BODY_LIMIT = 20_000;
/** `authorId` / `editedBy` of what the game master writes. */
export const MASTER_AUTHOR = 'mestre';

const recordId = z.string().regex(/^[a-z0-9_-]{1,64}$/);
const author = z.string().min(1);
const timestamp = z.string().min(1);
const dayNumber = z.number().int().nonnegative();

export const noteVisibilitySchema = z.enum(['todos', 'mestre']);

export const archiveTopicSchema = z.object({
  id: recordId,
  name: z.string().trim().min(1).max(TITLE_LIMIT),
  /** An emoji, shown before the name. */
  icon: z.string().max(16).optional(),
  order: z.number().int(),
  authorId: author,
  /** When it went to the trash; null while in use. */
  deletedAt: timestamp.nullable(),
});

export const archiveNoteSchema = z.object({
  id: recordId,
  topicId: recordId,
  title: z.string().trim().min(1).max(TITLE_LIMIT),
  body: z.string().max(BODY_LIMIT),
  /** Game day it records; starts as the current day and can be edited. */
  day: dayNumber,
  pinned: z.boolean(),
  visibility: noteVisibilitySchema,
  order: z.number().int(),
  authorId: author,
  editedBy: author.optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: timestamp.nullable(),
});

export const archiveSchema = z.object({
  topics: z.array(archiveTopicSchema),
  notes: z.array(archiveNoteSchema),
});

export type NoteVisibility = z.infer<typeof noteVisibilitySchema>;
export type ArchiveTopic = z.infer<typeof archiveTopicSchema>;
export type ArchiveNote = z.infer<typeof archiveNoteSchema>;
export type Archive = z.infer<typeof archiveSchema>;

export const EMPTY_ARCHIVE: Archive = { topics: [], notes: [] };

export type ArchiveParse = { ok: true; archive: Archive } | { ok: false; error: string };

/** Checks an untrusted archive (localStorage, an imported save). */
export function parseArchive(json: unknown): ArchiveParse {
  const result = archiveSchema.safeParse(json);
  if (!result.success) return { ok: false, error: z.prettifyError(result.error) };
  return { ok: true, archive: result.data };
}

// ---------------------------------------------------------------- commands

const direction = z.enum(['up', 'down']);
const noteFields = {
  title: z.string(),
  body: z.string(),
  day: dayNumber,
  pinned: z.boolean(),
  visibility: noteVisibilitySchema,
};
const topicFields = { name: z.string(), icon: z.string().max(16).optional() };

const command = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ type: z.literal(type), ...shape });

export const archiveCommandSchema = z.discriminatedUnion('type', [
  command('topic_create', { id: recordId, ...topicFields }),
  command('topic_update', { topicId: recordId, ...topicFields }),
  command('topic_shift', { topicId: recordId, direction }),
  command('topic_remove', { topicId: recordId }),
  command('topic_restore', { topicId: recordId }),
  command('note_create', { id: recordId, topicId: recordId, ...noteFields }),
  command('note_update', { noteId: recordId, ...noteFields }),
  command('note_move', { noteId: recordId, topicId: recordId }),
  command('note_shift', { noteId: recordId, direction }),
  command('note_remove', { noteId: recordId }),
  command('note_restore', { noteId: recordId }),
  command('notes_paste', {
    topicId: recordId,
    day: dayNumber,
    visibility: noteVisibilitySchema,
    notes: z
      .array(z.object({ id: recordId, title: z.string(), body: z.string() }))
      .min(1)
      .max(500),
  }),
  command('trash_empty', {}),
]);

export type ArchiveCommand = z.infer<typeof archiveCommandSchema>;
export type ArchiveCommandType = ArchiveCommand['type'];
export type NoteFields = Pick<ArchiveNote, 'title' | 'body' | 'day' | 'pinned' | 'visibility'>;

export type ArchiveError =
  | 'empty_name'
  | 'duplicate_name'
  | 'duplicate_id'
  | 'not_found'
  | 'category_not_empty'
  | 'forbidden'
  | 'too_long'
  | 'invalid_command'
  /** Offline, a player must pick their character before writing. */
  | 'no_author';

export interface ArchiveContext {
  viewer: Actor;
  /** ISO timestamp for createdAt / updatedAt / deletedAt. */
  now: string;
}

export type ArchiveOutcome =
  /** `change` is null when nothing should be logged (a no-op or a note only the master sees). */
  { ok: true; archive: Archive; change: ArchiveChange | null } | { ok: false; error: ArchiveError };

/** Validates the untrusted command, then applies it for `viewer`. A no-op keeps the same archive. */
export function applyArchiveCommand(
  archive: Archive,
  input: unknown,
  ctx: ArchiveContext,
): ArchiveOutcome {
  const parsed = archiveCommandSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_command');
  const command = parsed.data;
  const authorId = authorOf(ctx.viewer);
  if (!authorId) return fail('no_author');
  return run(command.type, command, { archive, ctx, authorId });
}

// ---------------------------------------------------------------- queries

export function canSee(viewer: Actor, note: Pick<ArchiveNote, 'visibility'>): boolean {
  return viewer.role === 'master' || note.visibility === 'todos';
}

/** What `viewer` may know about: players never get the master's notes. */
export function visibleArchive(archive: Archive, viewer: Actor): Archive {
  if (viewer.role === 'master') return archive;
  return { ...archive, notes: archive.notes.filter((note) => canSee(viewer, note)) };
}

export function authorOf(viewer: Actor): string | undefined {
  return viewer.role === 'master' ? MASTER_AUTHOR : viewer.characterId;
}

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

/** Topics in use, in display order. */
export function activeTopics(archive: Archive): ArchiveTopic[] {
  return archive.topics.filter((topic) => topic.deletedAt === null).sort(byOrder);
}

/** A topic's notes in display order: pinned first, then by order, then oldest first. */
export function topicNotes(archive: Archive, topicId: string): ArchiveNote[] {
  return sortNotes(archive.notes.filter((n) => n.topicId === topicId && n.deletedAt === null));
}

export function sortNotes(notes: readonly ArchiveNote[]): ArchiveNote[] {
  return [...notes].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      a.order - b.order ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

export function archiveCounts(archive: Archive): { topics: number; notes: number } {
  const topicIds = new Set(activeTopics(archive).map((topic) => topic.id));
  const notes = archive.notes.filter((n) => n.deletedAt === null && topicIds.has(n.topicId));
  return { topics: topicIds.size, notes: notes.length };
}

export function trashedTopics(archive: Archive): ArchiveTopic[] {
  return archive.topics.filter((topic) => topic.deletedAt !== null);
}

export function trashedNotes(archive: Archive): ArchiveNote[] {
  return archive.notes.filter((note) => note.deletedAt !== null);
}

/** Case and accents are ignored: "acao" finds "Ação". */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

/** Notes in use whose title or text contain `query`, in display order. */
export function searchNotes(archive: Archive, query: string): ArchiveNote[] {
  const needle = normalizeForSearch(query.trim());
  if (!needle) return [];
  const topicIds = new Set(activeTopics(archive).map((topic) => topic.id));
  return sortNotes(
    archive.notes.filter(
      (note) =>
        note.deletedAt === null &&
        topicIds.has(note.topicId) &&
        normalizeForSearch(`${note.title}\n${note.body}`).includes(needle),
    ),
  );
}

/** What a write must send to storage: changed or new records, and records gone for good. */
export interface ArchiveDiff {
  topics: ArchiveTopic[];
  notes: ArchiveNote[];
  removedTopicIds: string[];
  removedNoteIds: string[];
}

/** Rules return untouched records as the same objects, so identity tells what changed. */
export function archiveDiff(before: Archive, after: Archive): ArchiveDiff {
  const changed = <T extends { id: string }>(old: readonly T[], next: readonly T[]) => {
    const previous = new Map(old.map((item) => [item.id, item]));
    return next.filter((item) => previous.get(item.id) !== item);
  };
  const removed = (old: readonly { id: string }[], next: readonly { id: string }[]) => {
    const kept = new Set(next.map((item) => item.id));
    return old.filter((item) => !kept.has(item.id)).map((item) => item.id);
  };
  return {
    topics: changed(before.topics, after.topics),
    notes: changed(before.notes, after.notes),
    removedTopicIds: removed(before.topics, after.topics),
    removedNoteIds: removed(before.notes, after.notes),
  };
}

// ---------------------------------------------------------------- rules

type CommandOf = { [C in ArchiveCommand as C['type']]: C };
interface World {
  archive: Archive;
  ctx: ArchiveContext;
  authorId: string;
}
type Handler<K extends ArchiveCommandType> = (
  command: CommandOf[K],
  world: World,
) => ArchiveOutcome;
type Handlers = { [K in ArchiveCommandType]: Handler<K> };

function run<K extends ArchiveCommandType>(
  type: K,
  command: CommandOf[K],
  world: World,
): ArchiveOutcome {
  const handler: Handlers[K] = handlers[type];
  return handler(command, world);
}

const fail = (error: ArchiveError): ArchiveOutcome => ({ ok: false, error });
const unchanged = (archive: Archive): ArchiveOutcome => ({ ok: true, archive, change: null });
const done = (archive: Archive, change: ArchiveChange | null): ArchiveOutcome => ({
  ok: true,
  archive,
  change,
});

const handlers: Handlers = {
  topic_create: ({ id, name, icon }, { archive, authorId }) => {
    const error = idError(id, archive.topics) ?? topicNameError(archive, name);
    if (error) return fail(error);
    const topic: ArchiveTopic = {
      id,
      name: name.trim(),
      ...iconField(icon),
      order: nextOrder(archive.topics),
      authorId,
      deletedAt: null,
    };
    const change = { target: 'topic', action: 'created', title: topic.name } as const;
    return done({ ...archive, topics: [...archive.topics, topic] }, change);
  },

  topic_update: ({ topicId, name, icon }, { archive }) => {
    const topic = findActiveTopic(archive, topicId);
    if (!topic) return fail('not_found');
    const error = topicNameError(archive, name, topicId);
    if (error) return fail(error);
    const { id, order, authorId, deletedAt } = topic;
    const next: ArchiveTopic = {
      id,
      order,
      authorId,
      deletedAt,
      name: name.trim(),
      ...iconField(icon),
    };
    if (next.name === topic.name && next.icon === topic.icon) return unchanged(archive);
    const change = { target: 'topic', action: 'edited', title: next.name } as const;
    return done(replaceTopic(archive, next), change);
  },

  topic_shift: ({ topicId, direction }, { archive }) => {
    const topics = activeTopics(archive);
    const reordered = shift(topics, topicId, direction);
    if (!reordered) return fail('not_found');
    if (reordered === topics) return unchanged(archive);
    const changed = renumber(reordered);
    if (changed.length === 0) return unchanged(archive);
    const next = changed.reduce(replaceTopic, archive);
    const title = topics.find((topic) => topic.id === topicId)?.name ?? '';
    return done(next, { target: 'topic', action: 'reordered', title });
  },

  topic_remove: ({ topicId }, { archive, ctx }) => {
    const topic = findActiveTopic(archive, topicId);
    if (!topic) return fail('not_found');
    // Counts every note, the master's too: a player is refused without learning why.
    if (archive.notes.some((n) => n.topicId === topicId && n.deletedAt === null)) {
      return fail('category_not_empty');
    }
    const next = replaceTopic(archive, { ...topic, deletedAt: ctx.now });
    return done(next, { target: 'topic', action: 'removed', title: topic.name });
  },

  topic_restore: ({ topicId }, { archive }) => {
    const topic = archive.topics.find((t) => t.id === topicId && t.deletedAt !== null);
    if (!topic) return fail('not_found');
    const error = topicNameError(archive, topic.name, topicId);
    if (error) return fail(error);
    const next = replaceTopic(archive, { ...topic, deletedAt: null });
    return done(next, { target: 'topic', action: 'restored', title: topic.name });
  },

  note_create: ({ id, topicId, ...fields }, { archive, ctx, authorId }) => {
    if (!findActiveTopic(archive, topicId)) return fail('not_found');
    const error =
      idError(id, archive.notes) ?? noteFieldsError(fields) ?? visibilityError(ctx, fields);
    if (error) return fail(error);
    const note: ArchiveNote = {
      id,
      topicId,
      ...cleanFields(fields),
      order: nextOrder(archive.notes.filter((n) => n.topicId === topicId)),
      authorId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      deletedAt: null,
    };
    return done({ ...archive, notes: [...archive.notes, note] }, noteChange(note, 'created'));
  },

  note_update: ({ noteId, ...fields }, { archive, ctx, authorId }) => {
    const note = findVisibleNote(archive, ctx.viewer, noteId);
    if (!note) return fail('not_found');
    const error = noteFieldsError(fields) ?? visibilityError(ctx, fields);
    if (error) return fail(error);
    const clean = cleanFields(fields);
    if (sameFields(note, clean)) return unchanged(archive);
    const next = { ...note, ...clean, editedBy: authorId, updatedAt: ctx.now };
    return done(replaceNote(archive, next), noteChange(next, 'edited'));
  },

  note_move: ({ noteId, topicId }, { archive, ctx }) => {
    const note = findVisibleNote(archive, ctx.viewer, noteId);
    const from = note && findActiveTopic(archive, note.topicId);
    const to = findActiveTopic(archive, topicId);
    if (!note || !to) return fail('not_found');
    if (note.topicId === topicId) return unchanged(archive);
    const order = nextOrder(archive.notes.filter((n) => n.topicId === topicId));
    const next = { ...note, topicId, order, updatedAt: ctx.now };
    const change = {
      target: 'note',
      action: 'moved',
      title: note.title,
      from: from?.name ?? '',
      to: to.name,
    } as const;
    return done(replaceNote(archive, next), isPublic(next) ? change : null);
  },

  note_shift: ({ noteId, direction }, { archive, ctx }) => {
    const note = findVisibleNote(archive, ctx.viewer, noteId);
    if (!note) return fail('not_found');
    const siblings = topicNotes(archive, note.topicId).filter(
      (n) => n.pinned === note.pinned && canSee(ctx.viewer, n),
    );
    const reordered = shift(siblings, noteId, direction);
    if (!reordered || reordered === siblings) return unchanged(archive);
    const changed = renumber(reordered);
    if (changed.length === 0) return unchanged(archive);
    return done(changed.reduce(replaceNote, archive), noteChange(note, 'reordered'));
  },

  note_remove: ({ noteId }, { archive, ctx }) => {
    const note = findVisibleNote(archive, ctx.viewer, noteId);
    if (!note) return fail('not_found');
    const next = replaceNote(archive, { ...note, deletedAt: ctx.now });
    return done(next, noteChange(note, 'removed'));
  },

  note_restore: ({ noteId }, { archive, ctx }) => {
    const note = archive.notes.find(
      (n) => n.id === noteId && n.deletedAt !== null && canSee(ctx.viewer, n),
    );
    const topic = note && archive.topics.find((t) => t.id === note.topicId);
    if (!note || !topic) return fail('not_found');
    // A note never sits in a topic that is in the trash: the topic comes back with it.
    const withTopic =
      topic.deletedAt === null ? archive : replaceTopic(archive, { ...topic, deletedAt: null });
    const next = replaceNote(withTopic, { ...note, deletedAt: null });
    return done(next, noteChange(note, 'restored'));
  },

  notes_paste: ({ topicId, day, visibility, notes }, { archive, ctx, authorId }) => {
    const topic = findActiveTopic(archive, topicId);
    if (!topic) return fail('not_found');
    const ids = new Set(notes.map((n) => n.id));
    if (ids.size !== notes.length) return fail('duplicate_id');
    const error =
      visibilityError(ctx, { visibility }) ??
      notes.map((n) => idError(n.id, archive.notes) ?? noteFieldsError(n)).find(Boolean);
    if (error) return fail(error);
    const firstOrder = nextOrder(archive.notes.filter((n) => n.topicId === topicId));
    const created = notes.map((n, index): ArchiveNote => ({
      id: n.id,
      topicId,
      title: n.title.trim(),
      body: n.body,
      day,
      pinned: false,
      visibility,
      order: firstOrder + index,
      authorId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      deletedAt: null,
    }));
    const change = {
      target: 'notes',
      action: 'pasted',
      title: topic.name,
      count: created.length,
    } as const;
    return done(
      { ...archive, notes: [...archive.notes, ...created] },
      isPublic({ visibility }) ? change : null,
    );
  },

  trash_empty: (_command, { archive, ctx }) => {
    if (ctx.viewer.role !== 'master') return fail('forbidden');
    const topics = archive.topics.filter((topic) => topic.deletedAt === null);
    const kept = new Set(topics.map((topic) => topic.id));
    const notes = archive.notes.filter((n) => n.deletedAt === null && kept.has(n.topicId));
    if (topics.length === archive.topics.length && notes.length === archive.notes.length) {
      return unchanged(archive);
    }
    return done({ topics, notes }, { target: 'trash', action: 'emptied' });
  },
};

function idError(id: string, taken: readonly { id: string }[]): ArchiveError | null {
  return taken.some((other) => other.id === id) ? 'duplicate_id' : null;
}

/** Same rule as the categories: not blank, not repeated (ignoring case and spaces). */
function topicNameError(archive: Archive, name: string, ownId?: string): ArchiveError | null {
  const trimmed = name.trim();
  if (!trimmed) return 'empty_name';
  if (trimmed.length > TITLE_LIMIT) return 'too_long';
  const lower = trimmed.toLocaleLowerCase('pt-BR');
  const clash = activeTopics(archive).some(
    (topic) => topic.id !== ownId && topic.name.toLocaleLowerCase('pt-BR') === lower,
  );
  return clash ? 'duplicate_name' : null;
}

function findActiveTopic(archive: Archive, id: string): ArchiveTopic | undefined {
  return archive.topics.find((topic) => topic.id === id && topic.deletedAt === null);
}

/** Players get `not_found` for the master's notes, exactly as for a missing one. */
function findVisibleNote(archive: Archive, viewer: Actor, id: string): ArchiveNote | undefined {
  return archive.notes.find((n) => n.id === id && n.deletedAt === null && canSee(viewer, n));
}

function noteFieldsError({ title, body }: Pick<NoteFields, 'title' | 'body'>): ArchiveError | null {
  if (!title.trim()) return 'empty_name';
  if (title.trim().length > TITLE_LIMIT || body.length > BODY_LIMIT) return 'too_long';
  return null;
}

/** Only the master writes notes that only the master sees. */
function visibilityError(
  { viewer }: ArchiveContext,
  { visibility }: Pick<NoteFields, 'visibility'>,
): ArchiveError | null {
  return visibility === 'mestre' && viewer.role !== 'master' ? 'forbidden' : null;
}

function cleanFields(fields: NoteFields): NoteFields {
  const { title, body, day, pinned, visibility } = fields;
  return { title: title.trim(), body, day, pinned, visibility };
}

function sameFields(note: ArchiveNote, fields: NoteFields): boolean {
  return (Object.keys(fields) as (keyof NoteFields)[]).every((key) => note[key] === fields[key]);
}

function isPublic(note: Pick<ArchiveNote, 'visibility'>): boolean {
  return note.visibility === 'todos';
}

/** The master's notes never reach the log: it is shared with the players. */
function noteChange(
  note: ArchiveNote,
  action: 'created' | 'edited' | 'reordered' | 'removed' | 'restored',
): ArchiveChange | null {
  return isPublic(note) ? { target: 'note', action, title: note.title } : null;
}

function iconField(icon: string | undefined): { icon?: string } {
  const trimmed = icon?.trim();
  return trimmed ? { icon: trimmed } : {};
}

function nextOrder(items: readonly { order: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.order + 1), 0);
}

/**
 * The list with `id` swapped with its neighbor: the same list when it is
 * already at that end, null when `id` is not in it.
 */
function shift<T extends { id: string }>(
  items: readonly T[],
  id: string,
  direction: 'up' | 'down',
): readonly T[] | null {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const target = direction === 'up' ? index - 1 : index + 1;
  const neighbor = items[target];
  const item = items[index];
  if (!neighbor || !item) return items;
  const next = [...items];
  next[index] = neighbor;
  next[target] = item;
  return next;
}

/** Gives each item its position as order, returning only the ones whose order changed. */
function renumber<T extends { order: number }>(items: readonly T[]): T[] {
  return items.flatMap((item, order) => (item.order === order ? [] : [{ ...item, order }]));
}

function replaceTopic(archive: Archive, topic: ArchiveTopic): Archive {
  return { ...archive, topics: archive.topics.map((t) => (t.id === topic.id ? topic : t)) };
}

function replaceNote(archive: Archive, note: ArchiveNote): Archive {
  return { ...archive, notes: archive.notes.map((n) => (n.id === note.id ? note : n)) };
}
