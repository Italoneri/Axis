-- Run with `npx supabase test db` (needs `npx supabase start`, which needs Docker).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- ---------------------------------------------------------------- fixtures (as superuser)

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'mestre@teste.local'),
  ('00000000-0000-0000-0000-00000000000b', 'thorin@teste.local');

set local role service_role;
select public.create_game('Axis', '{"version":8,"revision":0}'::jsonb, '00000000-0000-0000-0000-00000000000a');
reset role;

create temporary table fixture as select id as game_id from public.games where name = 'Axis';
grant select on fixture to service_role, authenticated;

insert into public.players (game_id, user_id, role, character_id)
select game_id, '00000000-0000-0000-0000-00000000000b'::uuid, 'player', 'thorin' from fixture;

-- Another area holds a section with the group's shop id: the group must not reuse it.
insert into public.depot_sections (game_id, id, name, owner_id, position, author_id)
select game_id, 'entreposto-grupo', 'Mochila', 'thorin', 0, 'thorin' from fixture;

-- Buys `item` for `owner` as the revision after `revision`.
create function pg_temp.buy(revision integer, item text, owner text)
returns boolean
language sql
as $$
  select public.commit_shop_purchase(
    (select game_id from fixture),
    revision,
    jsonb_build_object('version', 8, 'revision', revision + 1),
    '00000000-0000-0000-0000-00000000000b',
    'Thorin',
    '{"type":"shop_buy"}'::jsonb,
    '[]'::jsonb,
    jsonb_build_object(
      'itemId', item, 'ownerId', owner, 'authorId', coalesce(owner, 'mestre'),
      'name', 'Espada curta', 'kind', 'equipamento', 'quantity', 1, 'notes', 'Afiada.'
    )
  );
$$;
grant execute on function pg_temp.buy(integer, text, text) to service_role, authenticated;

-- ---------------------------------------------------------------- the game function (service role)

set local role service_role;

select ok(pg_temp.buy(0, 'compra-1', 'thorin'), 'a purchase commits');
select ok(pg_temp.buy(1, 'compra-2', 'thorin'), 'a second purchase commits');
select is(
  (select array_agg(id) from public.depot_sections where owner_id = 'thorin' and id <> 'entreposto-grupo'),
  array['entreposto-thorin'],
  'creates the section once across two calls'
);
select is(
  (select array_agg(position order by id) from public.depot_items where section_id = 'entreposto-thorin'),
  array[0, 1],
  'each item goes after the last one'
);
select is(
  (select array_agg(distinct owner_id) from public.depot_items where id in ('compra-1', 'compra-2')),
  array['thorin'],
  'the item''s owner_id equals the delivery owner'
);

select is(pg_temp.buy(0, 'compra-3', 'thorin'), false, 'a stale revision commits nothing');
select is_empty(
  $$select 1 from public.depot_items where id = 'compra-3'$$,
  'rolls back the item when the revision conflicts'
);
select is((select revision from public.games where id = (select game_id from fixture)), 2, 'the game keeps the revision it had');

select ok(pg_temp.buy(2, 'compra-g', null), 'the master buys for the group');
select is(
  (select section_id from public.depot_items where id = 'compra-g'),
  'entreposto-compra-g',
  'a group purchase never reuses another area''s section, even with the group''s id'
);

reset role;

-- ---------------------------------------------------------------- clients

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select throws_ok(
  $$select pg_temp.buy(3, 'compra-x', 'thorin')$$,
  '42501', null, 'authenticated cannot execute the function'
);
reset role;

select * from finish();
rollback;
