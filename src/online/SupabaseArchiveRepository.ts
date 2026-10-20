import { z } from 'zod';
import type { ArchiveRepository, ArchiveSubmitResult } from '../persistence/ArchiveRepository';
import {
  applyArchiveCommand,
  archiveDiff,
  EMPTY_ARCHIVE,
  parseArchive,
  type Archive,
  type ArchiveCommand,
  type ArchiveContext,
  type ArchiveDiff,
  type ArchiveNote,
  type ArchiveTopic,
} from '../systems/Archive';

export type ArchiveTable = 'archive_topics' | 'archive_notes';

/** Rows as Postgres stores them (snake_case, nulls). */
export interface ArchiveRows {
  topics: TopicRow[];
  notes: NoteRow[];
}

export type ArchiveRowEvent =
  | { table: ArchiveTable; kind: 'upsert'; row: unknown }
  /** Deletes carry only the primary key. */
  | { table: ArchiveTable; kind: 'delete'; id: string };

/** Refusals the database answers with; anything else is thrown. */
export type ArchiveWriteResult =
  { ok: true } | { ok: false; error: 'forbidden' | 'category_not_empty' };

/** What the online archive needs from Supabase; `supabaseArchiveBackend` wires the real one. */
export interface ArchiveBackend {
  /** Both tables of the game, as RLS lets this user see them. */
  fetchRows(gameId: string): Promise<{ topics: unknown[]; notes: unknown[] }>;
  /** Upserts, then deletes, in an order the foreign key accepts. */
  writeRows(gameId: string, rows: ArchiveRowsChange): Promise<ArchiveWriteResult>;
  /** `replace_archive`, master only. */
  replaceRows(gameId: string, rows: ArchiveRows): Promise<ArchiveWriteResult>;
  watch(gameId: string, onEvent: (event: ArchiveRowEvent) => void): () => void;
}

export interface ArchiveRowsChange extends ArchiveRows {
  removedTopicIds: string[];
  removedNoteIds: string[];
}

// ---------------------------------------------------------------- rows

const topicRowSchema = z.object({
  id: z.string(),
  parent_id: z.string().nullable(),
  name: z.string(),
  icon: z.string().nullable(),
  position: z.number().int(),
  author_id: z.string(),
  deleted_at: z.string().nullable(),
});

const noteRowSchema = z.object({
  id: z.string(),
  topic_id: z.string(),
  title: z.string(),
  body: z.string(),
  day: z.number().int(),
  pinned: z.boolean(),
  visibility: z.string(),
  position: z.number().int(),
  author_id: z.string(),
  edited_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  /** Checked as the note's images by parseArchive. */
  images: z.array(z.unknown()).default([]),
});

type TopicRow = z.infer<typeof topicRowSchema>;
type NoteRow = z.infer<typeof noteRowSchema>;

export function topicToRow(topic: ArchiveTopic): TopicRow {
  return {
    id: topic.id,
    parent_id: topic.parentId,
    name: topic.name,
    icon: topic.icon ?? null,
    position: topic.order,
    author_id: topic.authorId,
    deleted_at: topic.deletedAt,
  };
}

export function noteToRow(note: ArchiveNote): NoteRow {
  return {
    id: note.id,
    topic_id: note.topicId,
    title: note.title,
    body: note.body,
    day: note.day,
    pinned: note.pinned,
    visibility: note.visibility,
    position: note.order,
    author_id: note.authorId,
    edited_by: note.editedBy ?? null,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    deleted_at: note.deletedAt,
    images: note.images,
  };
}

function topicFromRow(row: TopicRow): unknown {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    ...(row.icon ? { icon: row.icon } : {}),
    order: row.position,
    authorId: row.author_id,
    deletedAt: row.deleted_at,
  };
}

function noteFromRow(row: NoteRow): unknown {
  return {
    id: row.id,
    topicId: row.topic_id,
    title: row.title,
    body: row.body,
    day: row.day,
    pinned: row.pinned,
    visibility: row.visibility,
    order: row.position,
    authorId: row.author_id,
    ...(row.edited_by ? { editedBy: row.edited_by } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    images: row.images,
  };
}

/** Rows from the database (or realtime) into a checked archive. */
export function archiveFromRows(raw: { topics: unknown[]; notes: unknown[] }): Archive {
  const topics = z.array(topicRowSchema).parse(raw.topics).map(topicFromRow);
  const notes = z.array(noteRowSchema).parse(raw.notes).map(noteFromRow);
  const parsed = parseArchive({ topics, notes });
  if (!parsed.ok) throw new Error(`archive rows are invalid: ${parsed.error}`);
  return parsed.archive;
}

function rowsChange(diff: ArchiveDiff): ArchiveRowsChange {
  return {
    topics: diff.topics.map(topicToRow),
    notes: diff.notes.map(noteToRow),
    removedTopicIds: diff.removedTopicIds,
    removedNoteIds: diff.removedNoteIds,
  };
}

function isEmpty(change: ArchiveRowsChange): boolean {
  return [change.topics, change.notes, change.removedTopicIds, change.removedNoteIds].every(
    (list) => list.length === 0,
  );
}

// ---------------------------------------------------------------- repository

/**
 * Online archive: rules run here on the copy this user may see, and only the
 * rows that changed are written. RLS and the trigger have the last word: a
 * refusal from the database is reported like one from the rules.
 */
export class SupabaseArchiveRepository implements ArchiveRepository {
  private cache: Archive | null = null;

  constructor(
    private readonly backend: ArchiveBackend,
    private readonly gameId: string,
  ) {}

  async load(): Promise<Archive> {
    this.cache = archiveFromRows(await this.backend.fetchRows(this.gameId));
    return this.cache;
  }

  async submit(command: ArchiveCommand, ctx: ArchiveContext): Promise<ArchiveSubmitResult> {
    const base = this.cache ?? (await this.load());
    const outcome = applyArchiveCommand(base, command, ctx);
    if (!outcome.ok) return outcome;
    const change = rowsChange(archiveDiff(base, outcome.archive));
    if (isEmpty(change)) return outcome;

    const written = await this.backend.writeRows(this.gameId, change);
    if (!written.ok) {
      // Something this copy did not know (a hidden note, a newer change): catch up.
      await this.load();
      return written;
    }
    this.cache = outcome.archive;
    return outcome;
  }

  async replace(archive: Archive): Promise<void> {
    const written = await this.backend.replaceRows(this.gameId, {
      topics: archive.topics.map(topicToRow),
      notes: archive.notes.map(noteToRow),
    });
    if (!written.ok) throw new Error(`replace archive: ${written.error}`);
    this.cache = null;
  }

  subscribe(onRemoteChange: (archive: Archive) => void): () => void {
    return this.backend.watch(this.gameId, (event) => {
      const next = applyRowEvent(this.cache ?? EMPTY_ARCHIVE, event);
      if (!next) return;
      this.cache = next;
      onRemoteChange(next);
    });
  }
}

/** The archive with one realtime event applied; null when the event is unusable or unrelated. */
export function applyRowEvent(archive: Archive, event: ArchiveRowEvent): Archive | null {
  const isTopic = event.table === 'archive_topics';
  if (event.kind === 'delete') {
    const has = (isTopic ? archive.topics : archive.notes).some((item) => item.id === event.id);
    if (!has) return null;
    if (isTopic) {
      return {
        topics: archive.topics.filter((t) => t.id !== event.id),
        notes: archive.notes.filter((n) => n.topicId !== event.id),
      };
    }
    return { ...archive, notes: archive.notes.filter((n) => n.id !== event.id) };
  }
  try {
    const single = archiveFromRows({
      topics: isTopic ? [event.row] : [],
      notes: isTopic ? [] : [event.row],
    });
    return {
      topics: upsert(archive.topics, single.topics[0]),
      notes: upsert(archive.notes, single.notes[0]),
    };
  } catch (error) {
    console.warn('[archive] ignoring unexpected realtime row', error);
    return null;
  }
}

function upsert<T extends { id: string }>(items: readonly T[], item: T | undefined): T[] {
  if (!item) return [...items];
  const exists = items.some((other) => other.id === item.id);
  return exists ? items.map((other) => (other.id === item.id ? item : other)) : [...items, item];
}
