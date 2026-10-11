import { describe, expect, it } from 'vitest';
import type { Actor } from '../commands/schema';
import type { ArchiveNote, ArchiveTopic } from '../systems/Archive';
import {
  applyRowEvent,
  archiveFromRows,
  noteToRow,
  SupabaseArchiveRepository,
  topicToRow,
  type ArchiveBackend,
  type ArchiveRowsChange,
  type ArchiveWriteResult,
} from './SupabaseArchiveRepository';

const NOW = '2026-10-11T12:00:00.000Z';
const thorin: Actor = { role: 'player', characterId: 'thorin' };
const npcs: ArchiveTopic = {
  id: 'npcs',
  name: 'NPCs',
  order: 0,
  authorId: 'mestre',
  deletedAt: null,
};
const zolt: ArchiveNote = {
  id: 'zolt',
  topicId: 'npcs',
  title: 'Zolt-Raak',
  body: '**ferreiro**',
  day: 3,
  pinned: true,
  visibility: 'todos',
  order: 0,
  authorId: 'mestre',
  editedBy: 'thorin',
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
};

function fakeBackend(answer: ArchiveWriteResult = { ok: true }, notes = [zolt]) {
  const writes: ArchiveRowsChange[] = [];
  const backend: ArchiveBackend = {
    fetchRows: () => Promise.resolve({ topics: [topicToRow(npcs)], notes: notes.map(noteToRow) }),
    writeRows: (_gameId, change) => {
      writes.push(change);
      return Promise.resolve(answer);
    },
    replaceRows: () => Promise.resolve({ ok: true }),
    watch: () => () => undefined,
  };
  return { backend, writes };
}

describe('archive rows', () => {
  it('round-trips records through rows', () => {
    const rows = { topics: [topicToRow(npcs)], notes: [noteToRow(zolt)] };
    expect(archiveFromRows(rows)).toEqual({ topics: [npcs], notes: [zolt] });
    expect(rows.topics[0]).toMatchObject({ icon: null, position: 0, author_id: 'mestre' });
  });

  it('applies realtime upserts and deletes', () => {
    const archive = { topics: [npcs], notes: [zolt] };
    const renamed = { ...noteToRow(zolt), title: 'Zolt' };
    expect(
      applyRowEvent(archive, { table: 'archive_notes', kind: 'upsert', row: renamed })?.notes,
    ).toEqual([{ ...zolt, title: 'Zolt' }]);
    expect(applyRowEvent(archive, { table: 'archive_topics', kind: 'delete', id: 'npcs' })).toEqual(
      { topics: [], notes: [] },
    );
    expect(
      applyRowEvent(archive, { table: 'archive_notes', kind: 'delete', id: 'other' }),
    ).toBeNull();
  });
});

describe('SupabaseArchiveRepository', () => {
  it('writes only the rows a command changed', async () => {
    const { backend, writes } = fakeBackend();
    const repo = new SupabaseArchiveRepository(backend, 'game');
    const result = await repo.submit(
      { type: 'note_move', noteId: 'zolt', topicId: 'npcs' },
      { viewer: thorin, now: NOW },
    );
    expect(result).toMatchObject({ ok: true, change: null });
    expect(writes).toEqual([]);

    await repo.submit({ type: 'note_remove', noteId: 'zolt' }, { viewer: thorin, now: NOW });
    expect(writes).toEqual([
      {
        topics: [],
        notes: [{ ...noteToRow(zolt), deleted_at: NOW }],
        removedTopicIds: [],
        removedNoteIds: [],
      },
    ]);
  });

  it('reports what the database refuses, such as a topic with hidden notes', async () => {
    // The player's copy has no notes: only the trigger knows about the master's.
    const { backend } = fakeBackend({ ok: false, error: 'category_not_empty' }, []);
    const repo = new SupabaseArchiveRepository(backend, 'game');
    expect(
      await repo.submit({ type: 'topic_remove', topicId: 'npcs' }, { viewer: thorin, now: NOW }),
    ).toEqual({ ok: false, error: 'category_not_empty' });
  });
});
