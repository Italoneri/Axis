-- Run with `npx supabase test db` (needs `npx supabase start`, which needs Docker).
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- ---------------------------------------------------------------- fixtures (as superuser)

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'mestre@teste.local', '{"full_name":"Mestre"}'),
  ('00000000-0000-0000-0000-00000000000b', 'jogador@teste.local', '{"full_name":"Ana"}'),
  ('00000000-0000-0000-0000-00000000000c', 'outro@teste.local', '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'estranho@teste.local', '{}');

set local role service_role;
select public.create_game('Axis', '{"version":7,"revision":0}'::jsonb, '00000000-0000-0000-0000-00000000000a');
reset role;

create temporary table fixture as select id as game_id from public.games where name = 'Axis';
grant select on fixture to authenticated, service_role;

insert into public.join_links (game_id, token_hash, created_by, expires_at, revoked_at)
select game_id, 'link-ok', '00000000-0000-0000-0000-00000000000a'::uuid, null::timestamptz, null::timestamptz from fixture
union all
select game_id, 'link-expired', '00000000-0000-0000-0000-00000000000a'::uuid, now() - interval '1 day', null from fixture
union all
select game_id, 'link-revoked', '00000000-0000-0000-0000-00000000000a'::uuid, null, now() from fixture;

-- ---------------------------------------------------------------- peek and join (service role)

set local role service_role;
select is(public.peek_join('link-revoked', '00000000-0000-0000-0000-00000000000b') ->> 'status', 'revoked', 'a revoked link is refused');
select is(public.peek_join('link-expired', '00000000-0000-0000-0000-00000000000b') ->> 'status', 'expired', 'an expired link is refused');
select is(public.peek_join('nope', '00000000-0000-0000-0000-00000000000b') ->> 'status', 'invalid', 'an unknown link is refused');
select is(
  public.join_game('link-expired', '00000000-0000-0000-0000-00000000000b', 'thorin', 0, '{"revision":1}', 'Thorin', '{}', '[]') ->> 'status',
  'expired',
  'joining through an expired link is refused'
);
select is(
  public.join_game('link-revoked', '00000000-0000-0000-0000-00000000000b', 'thorin', 0, '{"revision":1}', 'Thorin', '{}', '[]') ->> 'status',
  'revoked',
  'joining through a revoked link is refused'
);

select is(
  public.join_game('link-ok', '00000000-0000-0000-0000-00000000000b', 'thorin', 0, '{"version":7,"revision":1}', 'Thorin', '{"type":"character_claim"}', '[]') ->> 'status',
  'ok',
  'a player takes a free character'
);
select is(
  public.peek_join('link-ok', '00000000-0000-0000-0000-00000000000c') -> 'taken',
  '["thorin"]'::jsonb,
  'the taken characters are listed'
);
select is(
  public.join_game('link-ok', '00000000-0000-0000-0000-00000000000c', 'thorin', 1, '{"version":7,"revision":2}', 'Thorin', '{}', '[]') ->> 'status',
  'character_taken',
  'a character already linked cannot be taken'
);
select is(
  public.join_game('link-ok', '00000000-0000-0000-0000-00000000000b', 'lyra', 1, '{"version":7,"revision":2}', 'Lyra', '{}', '[]') ->> 'status',
  'already_member',
  'a user gets one character per game'
);
select is(
  public.join_game('link-ok', '00000000-0000-0000-0000-00000000000c', 'lyra', 0, '{"version":7,"revision":1}', 'Lyra', '{}', '[]') ->> 'status',
  'conflict',
  'a join on a stale revision is refused'
);
select is(
  (select count(*)::int from public.players where user_id = '00000000-0000-0000-0000-00000000000c'),
  0,
  'a refused join leaves no link behind'
);
select is(
  (select revision from public.games g join fixture f on f.game_id = g.id),
  1,
  'only the accepted join saved the game'
);
reset role;

-- ---------------------------------------------------------------- reads

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}';
select is_empty('select * from public.games', 'a non-member reads no game');
select is_empty('select * from public.join_links', 'a non-member reads no join link');
select is_empty(
  $$select * from public.list_players((select game_id from fixture))$$,
  'a non-member gets no player list'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(
  (select display_name from public.list_players((select game_id from fixture)) where character_id = 'thorin'),
  'Ana',
  'the master sees who plays each character'
);
reset role;

-- ---------------------------------------------------------------- unlink (service role)

set local role service_role;
select is(
  public.unlink_player((select game_id from fixture), '00000000-0000-0000-0000-00000000000b', 1, '{"version":7,"revision":2}', '00000000-0000-0000-0000-00000000000a', 'Mestre', '{"type":"character_release"}', '[]'),
  'ok',
  'the master unlinks a player, keeping the character in the game'
);
reset role;

select * from finish();
rollback;
