-- Run with `npx supabase test db` (needs `npx supabase start`, which needs Docker).
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- ---------------------------------------------------------------- fixtures (as superuser)

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'mestre@teste.local'),
  ('00000000-0000-0000-0000-00000000000b', 'jogador@teste.local'),
  ('00000000-0000-0000-0000-00000000000c', 'estranho@teste.local');

set local role service_role;
select isnt(
  public.create_game('Axis', '{"version":4,"revision":0}'::jsonb, '00000000-0000-0000-0000-00000000000a'),
  null,
  'service role creates a game'
);
reset role;

create temporary table fixture as select id as game_id from public.games where name = 'Axis';
grant select on fixture to authenticated, service_role;

insert into public.invites (game_id, character_id, token_hash, created_by, expires_at)
select game_id, 'thorin', 'hash-ok', '00000000-0000-0000-0000-00000000000a'::uuid, now() + interval '1 day' from fixture
union all
select game_id, 'thorin', 'hash-expired', '00000000-0000-0000-0000-00000000000a'::uuid, now() - interval '1 day' from fixture;

-- ---------------------------------------------------------------- invites (service role)

set local role service_role;
select is(public.accept_invite('hash-ok', '00000000-0000-0000-0000-00000000000b') ->> 'status', 'ok', 'player accepts an invite');
select is(public.accept_invite('hash-ok', '00000000-0000-0000-0000-00000000000c') ->> 'status', 'used', 'an invite works once');
select is(public.accept_invite('hash-expired', '00000000-0000-0000-0000-00000000000c') ->> 'status', 'expired', 'expired invites are refused');
select is(public.accept_invite('nope', '00000000-0000-0000-0000-00000000000c') ->> 'status', 'invalid', 'unknown tokens are refused');
reset role;

-- ---------------------------------------------------------------- member reads

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is((select count(*)::int from public.games), 1, 'a player reads the game');
select is((select count(*)::int from public.players), 2, 'a player sees who plays');
select is(
  (select character_id from public.players where user_id = '00000000-0000-0000-0000-00000000000b'),
  'thorin',
  'the invite linked the player to the character'
);
select is_empty('select * from public.invites', 'a player does not see invites');

-- ---------------------------------------------------------------- no direct writes

select throws_ok(
  $$update public.games set revision = 99$$,
  '42501', null, 'a player cannot update a game'
);
select throws_ok(
  $$insert into public.game_log (game_id, revision, command) select game_id, 1, '{}' from fixture$$,
  '42501', null, 'a player cannot write the history'
);
select throws_ok(
  $$update public.players set role = 'master'$$,
  '42501', null, 'a player cannot promote themselves'
);
select throws_ok(
  $$select public.commit_game_update((select game_id from fixture), 0, '{"revision":1}', null, null, '{}', '[]')$$,
  '42501', null, 'a player cannot call the write function'
);

-- ---------------------------------------------------------------- strangers and masters

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select is_empty('select * from public.games', 'a stranger reads no game');
select is_empty('select * from public.game_log', 'a stranger reads no history');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select count(*)::int from public.invites), 2, 'the master reads the invites');
reset role;

-- ---------------------------------------------------------------- optimistic concurrency

set local role service_role;
select ok(
  public.commit_game_update((select game_id from fixture), 0, '{"version":4,"revision":1}', null, 'Mestre', '{"type":"advance_days","days":1}', '[]'),
  'a write on the expected revision goes through'
);
select ok(
  not public.commit_game_update((select game_id from fixture), 0, '{"version":4,"revision":1}', null, 'Mestre', '{}', '[]'),
  'a write on a stale revision is refused'
);
select is(
  (select count(*)::int from public.game_log),
  1,
  'only the accepted write is in the history'
);
select is(
  public.load_game_for((select game_id from fixture), '00000000-0000-0000-0000-00000000000b') ->> 'character_id',
  'thorin',
  'load_game_for returns the member role and character'
);
select is(
  public.load_game_for((select game_id from fixture), '00000000-0000-0000-0000-00000000000c'),
  null,
  'load_game_for returns nothing to a stranger'
);
reset role;

select * from finish();
rollback;
