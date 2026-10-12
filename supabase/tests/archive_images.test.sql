-- Run with `npx supabase test db` (needs `npx supabase start`, which needs Docker).
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ---------------------------------------------------------------- fixtures (as superuser)

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'mestre@teste.local'),
  ('00000000-0000-0000-0000-00000000000b', 'thorin@teste.local'),
  ('00000000-0000-0000-0000-00000000000c', 'estranho@teste.local');

set local role service_role;
select public.create_game('Axis', '{"version":5,"revision":0}'::jsonb, '00000000-0000-0000-0000-00000000000a');
reset role;

create temporary table fixture as select id as game_id from public.games where name = 'Axis';
grant select on fixture to authenticated;

insert into public.players (game_id, user_id, role, character_id)
select game_id, '00000000-0000-0000-0000-00000000000b'::uuid, 'player', 'thorin' from fixture;

insert into public.archive_topics (game_id, id, name, author_id)
select game_id, 'npcs', 'NPCs', 'mestre' from fixture;
insert into public.archive_notes (game_id, id, topic_id, title, day, visibility, author_id)
select game_id, n.id, 'npcs', n.id, 1, n.visibility, 'mestre' from fixture,
  (values ('mapa', 'todos'), ('plano', 'mestre')) as n (id, visibility);

-- Object paths of each note, as the client builds them.
create function pg_temp.image_path(note text, file text) returns text
language sql as $$ select (select game_id::text from fixture) || '/' || note || '/' || file $$;
grant execute on function pg_temp.image_path(text, text) to authenticated;

-- ---------------------------------------------------------------- the bucket and the column

select is(
  (select public from storage.buckets where id = 'archive-images'),
  false,
  'the image bucket is private'
);
select is(
  (select images from public.archive_notes where id = 'mapa'),
  '[]'::jsonb,
  'notes start without images'
);
select throws_ok(
  $$update public.archive_notes set images = (
      select jsonb_agg(jsonb_build_object('id', 'i' || g)) from generate_series(1, 13) g
    ) where id = 'mapa'$$,
  '23514',
  null,
  'a note holds at most 12 images'
);

-- ---------------------------------------------------------------- the master

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('archive-images', pg_temp.image_path('plano', 'segredo.webp'))$$,
  'the master attaches images to a master note'
);

-- ---------------------------------------------------------------- a player (Thorin)

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('archive-images', pg_temp.image_path('mapa', 'portao.webp')),
           ('archive-images', pg_temp.image_path('mapa', 'portao.thumb.webp'))$$,
  'a player attaches images to a note for everyone'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'archive-images'),
  2,
  'a player reads the images of notes for everyone, and only those'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('archive-images', pg_temp.image_path('plano', 'intruso.webp'))$$,
  '42501',
  null,
  'a player cannot attach images to a master note'
);
select ok(
  not public.can_access_archive_image(pg_temp.image_path('plano', 'segredo.webp'), false),
  'a player cannot read the images of a master note'
);
select ok(
  not public.can_access_archive_image(pg_temp.image_path('plano', 'segredo.webp'), true),
  'a player cannot remove the images of a master note'
);
select ok(
  public.can_access_archive_image(pg_temp.image_path('mapa', 'portao.webp'), true),
  'a player may remove the images of a note for everyone'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('archive-images', pg_temp.image_path('rascunho', 'nova.webp'))$$,
  'a player uploads images for a note still in the editor'
);
select ok(
  not public.can_access_archive_image(pg_temp.image_path('rascunho', 'nova.webp'), false),
  'files with no note are not readable by players'
);
select ok(
  not public.can_access_archive_image('not-a-game/mapa/portao.webp', true),
  'paths that are not game_id/note_id/file are refused'
);

-- ---------------------------------------------------------------- not a member

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select is_empty(
  $$select 1 from storage.objects where bucket_id = 'archive-images'$$,
  'a stranger reads no image'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('archive-images', pg_temp.image_path('mapa', 'estranho.webp'))$$,
  '42501',
  null,
  'a stranger cannot upload images'
);

-- ---------------------------------------------------------------- the master again

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is(
  (select count(*)::int from storage.objects where bucket_id = 'archive-images'),
  4,
  'the master reads every image, those with no note too'
);
reset role;

select * from finish();
rollback;
