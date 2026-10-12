-- Run with `npx supabase test db` (needs `npx supabase start`, which needs Docker).
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- ---------------------------------------------------------------- fixtures (as superuser)

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'mestre@teste.local'),
  ('00000000-0000-0000-0000-00000000000b', 'thorin@teste.local'),
  ('00000000-0000-0000-0000-00000000000d', 'bia@teste.local'),
  ('00000000-0000-0000-0000-00000000000c', 'estranho@teste.local');

set local role service_role;
select public.create_game('Axis', '{"version":5,"revision":0}'::jsonb, '00000000-0000-0000-0000-00000000000a');
reset role;

create temporary table fixture as select id as game_id from public.games where name = 'Axis';
grant select on fixture to authenticated;

insert into public.players (game_id, user_id, role, character_id)
select game_id, '00000000-0000-0000-0000-00000000000b'::uuid, 'player', 'thorin' from fixture
union all
select game_id, '00000000-0000-0000-0000-00000000000d'::uuid, 'player', 'bia' from fixture;

-- ---------------------------------------------------------------- the master writes

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$insert into public.archive_topics (game_id, id, name, author_id)
    select game_id, t.id, t.name, 'mestre' from fixture,
    (values ('npcs', 'NPCs'), ('segredos', 'Segredos'), ('jogadores', 'Jogadores')) as t (id, name)$$,
  'the master creates topics'
);
select lives_ok(
  $$insert into public.archive_notes (game_id, id, topic_id, title, day, visibility, author_id)
    select game_id, n.id, n.topic, n.title, 1, n.visibility, 'mestre' from fixture,
    (values ('zolt', 'npcs', 'Zolt-Raak', 'todos'),
            ('plano', 'npcs', 'Plano do vilão', 'mestre'),
            ('traidor', 'segredos', 'O traidor', 'mestre')) as n (id, topic, title, visibility)$$,
  'the master creates notes for everyone and for the master only'
);

-- ---------------------------------------------------------------- a player (Thorin)

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is(
  (select array_agg(id order by id) from public.archive_notes),
  array['zolt'],
  'a player never receives master notes'
);
select is_empty(
  $$select 1 from public.archive_notes where topic_id = 'segredos'$$,
  'a topic with only master notes looks empty to a player'
);
select lives_ok(
  $$insert into public.archive_topics (game_id, id, name, author_id)
    select game_id, 'pets', 'Pets', 'thorin' from fixture$$,
  'a player creates a topic'
);
select lives_ok(
  $$insert into public.archive_notes (game_id, id, topic_id, title, day, visibility, author_id)
    select game_id, 'selos', 'npcs', 'Requisição de Selos', 2, 'todos', 'thorin' from fixture$$,
  'a player creates a note for everyone'
);
select lives_ok(
  $$update public.archive_notes set title = 'Zolt-Raak, ferreiro', edited_by = 'thorin' where id = 'zolt'$$,
  'a player edits a note of another author'
);
select lives_ok(
  $$update public.archive_topics set name = 'Personagens' where id = 'jogadores'$$,
  'a player edits a topic of another author'
);
select throws_ok(
  $$insert into public.archive_notes (game_id, id, topic_id, title, day, visibility, author_id)
    select game_id, 'x', 'npcs', 'Secreto', 1, 'mestre', 'thorin' from fixture$$,
  '42501', null, 'a player cannot create a master note'
);
select throws_ok(
  $$update public.archive_notes set visibility = 'mestre' where id = 'selos'$$,
  '42501', null, 'a player cannot turn a note into a master note'
);
-- RLS hides the row from the update: nothing changes (checked as the master below).
select lives_ok(
  $$update public.archive_notes set title = 'hack' where id = 'plano'$$,
  'a player editing a master note reaches nothing'
);
select throws_ok(
  $$update public.archive_topics set deleted_at = now() where id = 'segredos'$$,
  '23514', 'category_not_empty', 'a topic holding only master notes is refused as not empty'
);
select throws_ok(
  $$update public.archive_topics set deleted_at = now() where id = 'npcs'$$,
  '23514', 'category_not_empty', 'a topic with notes cannot go to the trash'
);
select lives_ok(
  $$update public.archive_notes set deleted_at = now() where id = 'selos'$$,
  'a player sends a note to the trash'
);
select lives_ok(
  $$update public.archive_topics set deleted_at = now() where id = 'pets'$$,
  'a player sends an empty topic to the trash'
);
select lives_ok(
  $$delete from public.archive_notes where id = 'selos'$$,
  'a player deleting a note reaches nothing'
);
select isnt_empty(
  $$select 1 from public.archive_notes where id = 'selos'$$,
  'a player cannot empty the trash'
);
select throws_ok(
  $$select public.replace_archive((select game_id from fixture), '[]', '[]')$$,
  '42501', null, 'a player cannot replace the archive'
);
select throws_ok(
  $$insert into public.archive_topics (game_id, id, name, author_id)
    select game_id, 'longo', repeat('x', 201), 'thorin' from fixture$$,
  '23514', null, 'titles over 200 characters are refused'
);

-- ---------------------------------------------------------------- another player (Bia) restores

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}';

select lives_ok(
  $$update public.archive_notes set deleted_at = null where id = 'selos'$$,
  'another player restores a note from the trash'
);
select is(
  (select deleted_at from public.archive_notes where id = 'selos'),
  null,
  'the restored note is back in use'
);

-- ---------------------------------------------------------------- strangers and the master

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select is_empty('select 1 from public.archive_topics', 'a stranger reads no topic');
select is_empty('select 1 from public.archive_notes', 'a stranger reads no note');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(
  (select title from public.archive_notes where id = 'plano'),
  'Plano do vilão',
  'the master note is untouched'
);
select lives_ok(
  $$delete from public.archive_topics where deleted_at is not null$$,
  'the master empties the trash'
);
reset role;

select * from finish();
rollback;
