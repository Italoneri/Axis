import { describe, expect, it } from 'vitest';
import type { Actor } from '../commands/schema';
import {
  applyArchiveCommand,
  archiveCounts,
  archiveDiff,
  droppedImages,
  parseArchive,
  BODY_LIMIT,
  EMPTY_ARCHIVE,
  searchNotes,
  topicNotes,
  topicPath,
  topicSubtreeIds,
  topicTree,
  type TopicNode,
  visibleArchive,
  type Archive,
  type ArchiveImage,
  type ArchiveCommand,
  type ArchiveNote,
  type ArchiveTopic,
} from './Archive';

const master: Actor = { role: 'master' };
const thorin: Actor = { role: 'player', characterId: 'thorin' };
const bia: Actor = { role: 'player', characterId: 'bia' };
const NOW = '2026-10-11T12:00:00.000Z';

function topic(id: string, name: string, order = 0): ArchiveTopic {
  return { id, parentId: null, name, order, authorId: 'thorin', deletedAt: null };
}

function note(id: string, topicId: string, extra: Partial<ArchiveNote> = {}): ArchiveNote {
  return {
    id,
    topicId,
    title: id,
    body: '',
    day: 1,
    pinned: false,
    visibility: 'todos',
    order: 0,
    authorId: 'thorin',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    images: [],
    ...extra,
  };
}

const npcs = topic('npcs', 'NPCs', 0);
const players = topic('players', 'Jogadores', 1);
const secrets = topic('secrets', 'Segredos', 2);
const base: Archive = {
  topics: [npcs, players, secrets],
  notes: [
    note('zolt', 'npcs', { title: 'Zolt-Raak', body: 'Ferreiro da forja' }),
    note('selos', 'npcs', { title: 'Requisição de Selos', authorId: 'bia', order: 1 }),
    note('plano', 'npcs', { title: 'Plano do vilão', visibility: 'mestre', order: 2 }),
    note('traidor', 'secrets', { title: 'O traidor', visibility: 'mestre' }),
  ],
};

function run(command: ArchiveCommand, viewer: Actor, archive: Archive = base) {
  return applyArchiveCommand(archive, command, { viewer, now: NOW });
}

function applied(command: ArchiveCommand, viewer: Actor, archive: Archive = base) {
  const outcome = run(command, viewer, archive);
  if (!outcome.ok) throw new Error(`refused: ${outcome.error}`);
  return outcome;
}

const fields = {
  title: 'Nova',
  body: 'texto',
  day: 3,
  pinned: false,
  images: [] as ArchiveImage[],
} as const;

describe('archive permissions', () => {
  it('lets a player create, edit and remove topics and notes of anyone', () => {
    const created = applied(
      { type: 'topic_create', id: 'pets', name: ' Pets ', icon: '🐾', parentId: null },
      bia,
    );
    expect(created.archive.topics.at(-1)).toEqual({
      id: 'pets',
      parentId: null,
      name: 'Pets',
      icon: '🐾',
      order: 3,
      authorId: 'bia',
      deletedAt: null,
    });
    expect(created.change).toEqual({ target: 'topic', action: 'created', title: 'Pets' });

    const edited = applied(
      { type: 'note_update', noteId: 'selos', ...fields, visibility: 'todos' },
      thorin,
    );
    const selos = edited.archive.notes.find((n) => n.id === 'selos');
    expect(selos).toMatchObject({
      title: 'Nova',
      authorId: 'bia',
      editedBy: 'thorin',
      updatedAt: NOW,
    });
    expect(edited.change).toEqual({ target: 'note', action: 'edited', title: 'Nova' });

    expect(applied({ type: 'note_remove', noteId: 'zolt' }, bia).change).toEqual({
      target: 'note',
      action: 'removed',
      title: 'Zolt-Raak',
    });
  });

  it.each([
    {
      name: 'a player creating a master note',
      command: { type: 'note_create', id: 'x', topicId: 'npcs', ...fields, visibility: 'mestre' },
      error: 'forbidden',
    },
    {
      name: 'a player turning a note into a master note',
      command: { type: 'note_update', noteId: 'zolt', ...fields, visibility: 'mestre' },
      error: 'forbidden',
    },
    {
      name: 'a player pasting master notes',
      command: {
        type: 'notes_paste',
        topicId: 'npcs',
        day: 1,
        visibility: 'mestre',
        notes: [{ id: 'p1', title: 'a', body: '' }],
      },
      error: 'forbidden',
    },
    {
      name: 'a player editing a master note',
      command: { type: 'note_update', noteId: 'plano', ...fields, visibility: 'todos' },
      error: 'not_found',
    },
    {
      name: 'a player removing a master note',
      command: { type: 'note_remove', noteId: 'plano' },
      error: 'not_found',
    },
    { name: 'a player emptying the trash', command: { type: 'trash_empty' }, error: 'forbidden' },
    {
      name: 'a player removing a topic holding only master notes',
      command: { type: 'topic_remove', topicId: 'secrets' },
      error: 'category_not_empty',
    },
  ] satisfies { name: string; command: ArchiveCommand; error: string }[])(
    'refuses $name',
    ({ command, error }) => {
      expect(run(command, thorin)).toEqual({ ok: false, error });
    },
  );

  it('asks an offline player to pick a character before writing', () => {
    expect(
      run({ type: 'topic_create', id: 'a', name: 'A', parentId: null }, { role: 'player' }),
    ).toEqual({
      ok: false,
      error: 'no_author',
    });
  });

  it('never shows master notes to players', () => {
    const seen = visibleArchive(base, thorin);
    expect(seen.notes.map((n) => n.id)).toEqual(['zolt', 'selos']);
    expect(topicNotes(seen, 'secrets')).toEqual([]);
    expect(searchNotes(seen, 'traidor')).toEqual([]);
    expect(archiveCounts(seen)).toEqual({ topics: 3, notes: 2 });
    expect(archiveCounts(base)).toEqual({ topics: 3, notes: 4 });
  });

  it('does not log changes to master notes', () => {
    const create = { type: 'note_create', id: 'n', topicId: 'npcs', ...fields } as const;
    expect(applied({ ...create, visibility: 'mestre' }, master).change).toBeNull();
    expect(applied({ type: 'note_remove', noteId: 'plano' }, master).change).toBeNull();
    expect(
      applied({ type: 'note_move', noteId: 'plano', topicId: 'players' }, master).change,
    ).toBeNull();
    expect(applied({ ...create, visibility: 'todos' }, master).change).toEqual({
      target: 'note',
      action: 'created',
      title: 'Nova',
    });
  });
});

describe('archive rules', () => {
  it('refuses removing a topic that still has notes', () => {
    expect(run({ type: 'topic_remove', topicId: 'npcs' }, master)).toEqual({
      ok: false,
      error: 'category_not_empty',
    });
    const removed = applied({ type: 'topic_remove', topicId: 'players' }, thorin);
    expect(removed.archive.topics.find((t) => t.id === 'players')?.deletedAt).toBe(NOW);
  });

  it('moves a note to the end of another topic', () => {
    const moved = applied({ type: 'note_move', noteId: 'zolt', topicId: 'players' }, bia);
    expect(moved.archive.notes.find((n) => n.id === 'zolt')).toMatchObject({
      topicId: 'players',
      order: 0,
    });
    expect(moved.change).toEqual({
      target: 'note',
      action: 'moved',
      title: 'Zolt-Raak',
      from: 'NPCs',
      to: 'Jogadores',
    });
  });

  it('restores from the trash, bringing the topic back with its note', () => {
    const noteGone = applied({ type: 'note_remove', noteId: 'zolt' }, thorin).archive;
    const emptied = applied({ type: 'note_remove', noteId: 'selos' }, thorin, noteGone).archive;
    const withMasterGone = applied({ type: 'note_remove', noteId: 'plano' }, master, emptied);
    const topicGone = applied(
      { type: 'topic_remove', topicId: 'npcs' },
      thorin,
      withMasterGone.archive,
    ).archive;

    const restored = applied({ type: 'note_restore', noteId: 'zolt' }, bia, topicGone);
    expect(restored.archive.topics.find((t) => t.id === 'npcs')?.deletedAt).toBeNull();
    expect(restored.archive.notes.find((n) => n.id === 'zolt')?.deletedAt).toBeNull();
    expect(restored.change).toEqual({ target: 'note', action: 'restored', title: 'Zolt-Raak' });
  });

  it('empties the trash for good, master only', () => {
    const trashed = applied({ type: 'note_remove', noteId: 'zolt' }, thorin).archive;
    const emptied = applied({ type: 'trash_empty' }, master, trashed);
    expect(emptied.archive.notes.map((n) => n.id)).toEqual(['selos', 'plano', 'traidor']);
    expect(archiveDiff(trashed, emptied.archive)).toEqual({
      topics: [],
      notes: [],
      removedTopicIds: [],
      removedNoteIds: ['zolt'],
    });
  });

  it('shows pinned notes first and reorders among visible neighbors', () => {
    const pinned = applied(
      {
        type: 'note_update',
        noteId: 'selos',
        ...fields,
        title: 'Selos',
        pinned: true,
        visibility: 'todos',
      },
      thorin,
    ).archive;
    expect(topicNotes(pinned, 'npcs').map((n) => n.id)).toEqual(['selos', 'zolt', 'plano']);

    const shifted = applied({ type: 'note_shift', noteId: 'selos', direction: 'up' }, thorin);
    expect(topicNotes(shifted.archive, 'npcs').map((n) => n.id)).toEqual([
      'selos',
      'zolt',
      'plano',
    ]);
    expect(archiveDiff(base, shifted.archive).notes.map((n) => [n.id, n.order])).toEqual([
      ['zolt', 1],
      ['selos', 0],
    ]);
    expect(run({ type: 'note_shift', noteId: 'zolt', direction: 'up' }, thorin)).toEqual({
      ok: true,
      archive: base,
      change: null,
    });
  });

  it('pastes many notes as one logged change', () => {
    const pasted = applied(
      {
        type: 'notes_paste',
        topicId: 'players',
        day: 7,
        visibility: 'todos',
        notes: [
          { id: 'p1', title: 'Um', body: 'a' },
          { id: 'p2', title: 'Dois', body: 'b' },
        ],
      },
      bia,
    );
    expect(topicNotes(pasted.archive, 'players').map((n) => [n.title, n.order, n.day])).toEqual([
      ['Um', 0, 7],
      ['Dois', 1, 7],
    ]);
    expect(pasted.change).toEqual({
      target: 'notes',
      action: 'pasted',
      title: 'Jogadores',
      count: 2,
    });
  });

  it.each([
    { name: 'blank title', patch: { title: '  ' }, error: 'empty_name' },
    { name: 'long title', patch: { title: 'x'.repeat(201) }, error: 'too_long' },
    { name: 'long text', patch: { body: 'x'.repeat(BODY_LIMIT + 1) }, error: 'too_long' },
  ])('refuses a note with $name', ({ patch, error }) => {
    const command = {
      type: 'note_create',
      id: 'n',
      topicId: 'npcs',
      ...fields,
      visibility: 'todos',
      ...patch,
    } as const;
    expect(run(command, thorin)).toEqual({ ok: false, error });
  });

  it('refuses duplicate topic names and unknown commands', () => {
    expect(run({ type: 'topic_create', id: 'n2', name: 'npcs', parentId: null }, thorin)).toEqual({
      ok: false,
      error: 'duplicate_name',
    });
    expect(
      applyArchiveCommand(EMPTY_ARCHIVE, { type: 'nope' }, { viewer: master, now: NOW }),
    ).toEqual({
      ok: false,
      error: 'invalid_command',
    });
  });

  it('searches titles and texts ignoring case and accents', () => {
    expect(searchNotes(base, 'REQUISICAO').map((n) => n.id)).toEqual(['selos']);
    expect(searchNotes(base, 'forja').map((n) => n.id)).toEqual(['zolt']);
    expect(searchNotes(base, '   ')).toEqual([]);
  });
});

describe('note images', () => {
  const image = (id: string, caption = ''): ArchiveImage => ({
    id,
    caption,
    width: 800,
    height: 600,
    bytes: 1000,
    format: 'webp',
  });
  const mapa = image('mapa', 'Mapa do Portão Oito');
  const withImages: Archive = {
    ...base,
    notes: base.notes.map((n) =>
      n.id === 'zolt'
        ? { ...n, images: [mapa] }
        : n.id === 'plano'
          ? { ...n, images: [image('segredo')] }
          : n,
    ),
  };
  const zolt = withImages.notes.find((n) => n.id === 'zolt') ?? note('zolt', 'npcs');
  const update = (images: ArchiveImage[], noteId = 'zolt') =>
    ({
      type: 'note_update',
      noteId,
      title: zolt.title,
      body: zolt.body,
      day: zolt.day,
      pinned: zolt.pinned,
      visibility: 'todos',
      images,
    }) as const;

  it('reads archives saved before images as notes without any', () => {
    const old: Partial<ArchiveNote> = note('velha', 'npcs');
    delete old.images;
    const parsed = parseArchive({ topics: [npcs], notes: [old] });
    expect(parsed.ok && parsed.archive.notes[0]?.images).toEqual([]);
  });

  it('logs the images attached, keeping their order and trimmed captions', () => {
    const outcome = applied(update([image('carta', '  Carta  '), mapa]), bia, withImages);
    expect(outcome.change).toEqual({
      target: 'images',
      action: 'attached',
      title: 'Zolt-Raak',
      count: 1,
    });
    const images = outcome.archive.notes.find((n) => n.id === 'zolt')?.images;
    expect(images?.map((i) => [i.id, i.caption])).toEqual([
      ['carta', 'Carta'],
      ['mapa', 'Mapa do Portão Oito'],
    ]);
  });

  it('logs a caption change or a new order as an edit', () => {
    const outcome = applied(update([{ ...mapa, caption: 'Portão' }]), bia, withImages);
    expect(outcome.change).toMatchObject({ target: 'note', action: 'edited' });
    expect(run(update([mapa]), bia, withImages)).toMatchObject({ ok: true, change: null });
  });

  it('refuses more images than a note holds, or the same image twice', () => {
    const many = Array.from({ length: 13 }, (_, i) => image(`img${i}`));
    expect(run(update(many), bia, withImages)).toEqual({ ok: false, error: 'too_many_images' });
    expect(run(update([mapa, mapa]), bia, withImages)).toEqual({
      ok: false,
      error: 'duplicate_id',
    });
  });

  it('removes one image at once and logs it, never for the master notes', () => {
    const removed = applied(
      { type: 'note_image_remove', noteId: 'zolt', imageId: 'mapa' },
      bia,
      withImages,
    );
    expect(removed.change).toEqual({ target: 'image', action: 'removed', title: 'Zolt-Raak' });
    expect(droppedImages(withImages, removed.archive)).toEqual([{ noteId: 'zolt', image: mapa }]);

    const secret = { type: 'note_image_remove', noteId: 'plano', imageId: 'segredo' } as const;
    expect(run(secret, thorin, withImages)).toEqual({ ok: false, error: 'not_found' });
    expect(applied(secret, master, withImages).change).toBeNull();
  });

  it('keeps the images of a note in the trash and drops their files only when emptied', () => {
    const trashed = applied({ type: 'note_remove', noteId: 'zolt' }, bia, withImages).archive;
    expect(droppedImages(withImages, trashed)).toEqual([]);
    const restored = applied({ type: 'note_restore', noteId: 'zolt' }, bia, trashed).archive;
    expect(restored.notes.find((n) => n.id === 'zolt')?.images).toEqual([mapa]);

    const emptied = applied({ type: 'trash_empty' }, master, trashed).archive;
    expect(droppedImages(trashed, emptied)).toEqual([{ noteId: 'zolt', image: mapa }]);
  });

  it('finds notes by their image captions', () => {
    expect(searchNotes(withImages, 'portao oito').map((n) => n.id)).toEqual(['zolt']);
  });
});

describe('sub-topics', () => {
  const reino = { ...topic('reino', 'Reino Humano', 0) };
  const divindade = { ...topic('divindade', 'Divindade', 1), parentId: 'reino' };
  const enganacao = { ...topic('enganacao', 'Deusa da Enganação', 2), parentId: 'divindade' };
  const tree: Archive = {
    topics: [reino, divindade, enganacao, { ...topic('elfos', 'Elfos', 3) }],
    notes: [note('lyra', 'enganacao')],
  };
  const shape = (nodes: TopicNode[]): unknown[] =>
    nodes.map((node) => [node.topic.id, ...shape(node.children)]);

  it('shows topics as a tree with their paths and branches', () => {
    expect(shape(topicTree(tree))).toEqual([['reino', ['divindade', ['enganacao']]], ['elfos']]);
    expect(topicPath(tree, 'enganacao').map((t) => t.id)).toEqual([
      'reino',
      'divindade',
      'enganacao',
    ]);
    expect([...topicSubtreeIds(tree, 'divindade')]).toEqual(['divindade', 'enganacao']);
  });

  it('shows at the top a topic whose parent is missing or that loops back to itself', () => {
    const odd: Archive = {
      notes: [],
      topics: [
        { ...topic('a', 'A', 0), parentId: 'b' },
        { ...topic('b', 'B', 1), parentId: 'a' },
        { ...topic('c', 'C', 2), parentId: 'a' },
        { ...topic('orfao', 'Órfão', 3), parentId: 'sumiu' },
      ],
    };
    expect(shape(topicTree(odd))).toEqual([['a', ['c']], ['b'], ['orfao']]);
  });

  it('creates a sub-topic, allowing a name repeated only under another parent', () => {
    const created = applied(
      { type: 'topic_create', id: 'div-elfos', name: 'Divindade', parentId: 'elfos' },
      thorin,
      tree,
    );
    expect(created.archive.topics.at(-1)).toMatchObject({ parentId: 'elfos', name: 'Divindade' });

    const twin = { type: 'topic_create', id: 'x', name: 'divindade', parentId: 'reino' } as const;
    expect(run(twin, thorin, tree)).toEqual({ ok: false, error: 'duplicate_name' });
    const lost = { type: 'topic_create', id: 'x', name: 'X', parentId: 'sumiu' } as const;
    expect(run(lost, thorin, tree)).toEqual({ ok: false, error: 'not_found' });
  });

  it.each([
    ['itself', 'divindade', 'invalid_parent'],
    ['a topic below it', 'enganacao', 'invalid_parent'],
    ['a topic not in use', 'sumiu', 'not_found'],
  ] as const)('refuses moving a topic under %s', (_case, parentId, error) => {
    const command = { type: 'topic_update', topicId: 'divindade', name: 'Divindade', parentId } as const;
    expect(run(command, thorin, tree)).toEqual({ ok: false, error });
  });

  it('moves a topic with everything below it, logged as an edit', () => {
    const moved = applied(
      { type: 'topic_update', topicId: 'divindade', name: 'Divindade', parentId: 'elfos' },
      thorin,
      tree,
    );
    expect(shape(topicTree(moved.archive))).toEqual([
      ['reino'],
      ['elfos', ['divindade', ['enganacao']]],
    ]);
    expect(moved.change).toEqual({ target: 'topic', action: 'edited', title: 'Divindade' });
  });

  it('reorders a topic among its siblings only', () => {
    const shifted = applied(
      { type: 'topic_shift', topicId: 'elfos', direction: 'up' },
      thorin,
      tree,
    ).archive;
    expect(shape(topicTree(shifted))).toEqual([['elfos'], ['reino', ['divindade', ['enganacao']]]]);
    const alone = { type: 'topic_shift', topicId: 'divindade', direction: 'up' } as const;
    expect(applied(alone, thorin, tree).archive).toBe(tree);
  });

  it('refuses to trash a topic with sub-topics in use', () => {
    expect(run({ type: 'topic_remove', topicId: 'reino' }, thorin, tree)).toEqual({
      ok: false,
      error: 'category_not_empty',
    });
  });

  it('brings the trashed topics above back with a restored topic or note', () => {
    let trashed = applied({ type: 'note_remove', noteId: 'lyra' }, thorin, tree).archive;
    for (const topicId of ['enganacao', 'divindade', 'reino']) {
      trashed = applied({ type: 'topic_remove', topicId }, thorin, trashed).archive;
    }
    const byNote = applied({ type: 'note_restore', noteId: 'lyra' }, bia, trashed).archive;
    expect(shape(topicTree(byNote))).toEqual([['reino', ['divindade', ['enganacao']]], ['elfos']]);
    const byTopic = applied({ type: 'topic_restore', topicId: 'divindade' }, bia, trashed).archive;
    expect(shape(topicTree(byTopic))).toEqual([['reino', ['divindade']], ['elfos']]);
  });

  it('moves to the top what was under a topic deleted for good', () => {
    const odd: Archive = {
      notes: [],
      topics: [{ ...reino, deletedAt: NOW }, divindade],
    };
    const emptied = applied({ type: 'trash_empty' }, master, odd).archive;
    expect(emptied.topics).toEqual([{ ...divindade, parentId: null }]);
  });

  it('reads topics saved before sub-topics as top topics', () => {
    const old = { id: 'reino', name: 'Reino', order: 0, authorId: 'mestre', deletedAt: null };
    const parsed = parseArchive({ topics: [old], notes: [] });
    expect(parsed.ok && parsed.archive.topics[0]?.parentId).toBeNull();
  });
});
