-- Run with `npx supabase test db` (needs `npx supabase start`, which needs Docker).
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ---------------------------------------------------------------- fixtures (as superuser)

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'mestre@teste.local'),
  ('00000000-0000-0000-0000-00000000000b', 'thorin@teste.local'),
  ('00000000-0000-0000-0000-00000000000c', 'estranho@teste.local');

set local role service_role;
select public.create_game('Axis', '{"version":7,"revision":0}'::jsonb, '00000000-0000-0000-0000-00000000000a');
reset role;

create temporary table fixture as select id as game_id from public.games where name = 'Axis';
grant select on fixture to authenticated;

insert into public.players (game_id, user_id, role, character_id)
select game_id, '00000000-0000-0000-0000-00000000000b'::uuid, 'player', 'thorin' from fixture;

-- Object paths as the client builds them: game_id/kind/id/file.
create function pg_temp.photo_path(kind text, id text, file text) returns text
language sql as $$
  select (select game_id::text from fixture) || '/' || kind || '/' || id || '/' || file
$$;
grant execute on function pg_temp.photo_path(text, text, text) to authenticated;

-- ---------------------------------------------------------------- the bucket

select is(
  (select public from storage.buckets where id = 'game-images'),
  false,
  'the photo bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'game-images'),
  307200::bigint,
  'a stored photo is at most 300 KB'
);

-- ---------------------------------------------------------------- the master

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$insert into storage.objects (bucket_id, name) values
    ('game-images', pg_temp.photo_path('npc', 'bianca', 'img_1.webp')),
    ('game-images', pg_temp.photo_path('material', 'iron', 'img_2.webp')),
    ('game-images', pg_temp.photo_path('world', 'human', 'img_3.webp')),
    ('game-images', pg_temp.photo_path('character', 'lyra', 'img_4.webp'))$$,
  'the master sends photos of NPCs, materials, worlds and any character'
);

-- ---------------------------------------------------------------- a player (Thorin)

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select lives_ok(
  $$insert into storage.objects (bucket_id, name) values
    ('game-images', pg_temp.photo_path('character', 'thorin', 'img_5.webp')),
    ('game-images', pg_temp.photo_path('character', 'thorin', 'img_5.thumb.webp'))$$,
  'a player sends the photo of their own character'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'game-images'),
  6,
  'a player sees every photo of the game'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('game-images', pg_temp.photo_path('character', 'lyra', 'img_6.webp'))$$,
  '42501',
  null,
  'a player cannot send the photo of another character'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('game-images', pg_temp.photo_path('npc', 'bianca', 'img_7.webp'))$$,
  '42501',
  null,
  'a player cannot send the photo of an NPC'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('game-images', pg_temp.photo_path('material', 'iron', 'img_8.webp'))$$,
  '42501',
  null,
  'a player cannot send the photo of a material'
);
select ok(
  not public.can_access_game_image(pg_temp.photo_path('world', 'human', 'img_3.webp'), true),
  'a player cannot replace or remove the photo of a world'
);
select ok(
  public.can_access_game_image(pg_temp.photo_path('character', 'thorin', 'img_5.webp'), true),
  'a player may replace or remove the photo of their own character'
);
select ok(
  not public.can_access_game_image(pg_temp.photo_path('character', 'lyra', 'img_4.webp'), true),
  'a player cannot remove the photo of another character'
);
select ok(
  not public.can_access_game_image(pg_temp.photo_path('dragon', 'thorin', 'img.webp'), false),
  'paths of an unknown kind are refused'
);
select ok(
  not public.can_access_game_image('not-a-game/character/thorin/img.webp', false),
  'paths that are not game_id/kind/id/file are refused'
);

-- ---------------------------------------------------------------- not a member

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select is_empty(
  $$select 1 from storage.objects where bucket_id = 'game-images'$$,
  'a stranger sees no photo'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('game-images', pg_temp.photo_path('character', 'thorin', 'img_9.webp'))$$,
  '42501',
  null,
  'a stranger cannot send photos'
);
reset role;

select * from finish();
rollback;
