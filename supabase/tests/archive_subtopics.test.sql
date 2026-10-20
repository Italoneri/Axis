-- Run with `npx supabase test db` (needs `npx supabase start`, which needs Docker).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- ---------------------------------------------------------------- fixtures (as superuser)

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'mestre@teste.local'),
  ('00000000-0000-0000-0000-00000000000b', 'thorin@teste.local');

set local role service_role;
select public.create_game('Axis', '{"version":5,"revision":0}'::jsonb, '00000000-0000-0000-0000-00000000000a');
reset role;

create temporary table fixture as select id as game_id from public.games where name = 'Axis';
grant select on fixture to authenticated;

insert into public.players (game_id, user_id, role, character_id)
select game_id, '00000000-0000-0000-0000-00000000000b'::uuid, 'player', 'thorin' from fixture;

-- ---------------------------------------------------------------- a player builds a tree

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select lives_ok(
  $$insert into public.archive_topics (game_id, id, parent_id, name, author_id)
    select game_id, t.id, t.parent, t.name, 'thorin' from fixture,
    (values ('reino', null, 'Reino Humano'),
            ('divindade', 'reino', 'Divindade'),
            ('enganacao', 'divindade', 'Deusa da Enganação')) as t (id, parent, name)$$,
  'a player creates topics under topics, in one statement'
);
select throws_ok(
  $$insert into public.archive_topics (game_id, id, parent_id, name, author_id)
    select game_id, 'solto', 'nao-existe', 'Solto', 'thorin' from fixture$$,
  '23503', null, 'a parent must be a topic of the same game'
);
select throws_ok(
  $$update public.archive_topics set parent_id = id where id = 'reino'$$,
  '23514', null, 'a topic cannot be its own parent'
);
select throws_ok(
  $$update public.archive_topics set deleted_at = now() where id = 'divindade'$$,
  '23514', 'category_not_empty', 'a topic with a sub-topic in use cannot go to the trash'
);
select lives_ok(
  $$update public.archive_topics set deleted_at = now() where id = 'enganacao'$$,
  'an empty sub-topic goes to the trash'
);
select lives_ok(
  $$update public.archive_topics set deleted_at = now() where id = 'divindade'$$,
  'a topic whose sub-topics are all in the trash goes to the trash'
);

-- ---------------------------------------------------------------- the master

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- Only a hand-written restore leaves a topic in use under one in the trash.
update public.archive_topics set deleted_at = null where id = 'enganacao';
select lives_ok(
  $$delete from public.archive_topics where deleted_at is not null$$,
  'the master empties the trash with a topic in use under a trashed one'
);
select is(
  (select parent_id from public.archive_topics where id = 'enganacao'),
  null,
  'what was under a topic deleted for good moves to the top'
);

select lives_ok(
  $$select public.replace_archive(
      (select game_id from fixture),
      '[{"id":"filho","parent_id":"pai","name":"Filho","position":0,"author_id":"mestre"},
        {"id":"pai","parent_id":null,"name":"Pai","position":1,"author_id":"mestre"}]',
      '[]')$$,
  'importing a save keeps where each topic sits, in any order'
);
select is(
  (select parent_id from public.archive_topics where id = 'filho'),
  'pai',
  'the imported sub-topic sits under its parent'
);
reset role;

select * from finish();
rollback;
