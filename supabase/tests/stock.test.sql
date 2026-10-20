-- Run with `npx supabase test db` (needs `npx supabase start`, which needs Docker).
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- ---------------------------------------------------------------- fixtures (as superuser)

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'mestre@teste.local'),
  ('00000000-0000-0000-0000-00000000000b', 'thorin@teste.local');

set local role service_role;
select public.create_game('Axis', '{"version":11,"revision":0}'::jsonb, '00000000-0000-0000-0000-00000000000a');
reset role;

create temporary table fixture as select id as game_id from public.games where name = 'Axis';
grant select on fixture to service_role, authenticated;

insert into public.players (game_id, user_id, role, character_id)
select game_id, '00000000-0000-0000-0000-00000000000b'::uuid, 'player', 'thorin' from fixture;

insert into public.depot_sections (game_id, id, name, owner_id, position, author_id)
select game_id, 'porcoes', 'porções', null, 0, 'mestre' from fixture
union all
select game_id, 'bau', 'Baú', 'thorin', 0, 'thorin' from fixture;

insert into public.depot_items (game_id, id, section_id, owner_id, name, kind, quantity, position, author_id)
select game_id, 'semente', 'porcoes', null, 'Semente de Hortelã', 'outro', 1, 0, 'mestre' from fixture
union all
select game_id, 'erva', 'porcoes', null, 'Hortelã', 'outro', 99998, 1, 'mestre' from fixture
union all
select game_id, 'lixo', 'porcoes', null, 'Velha', 'outro', 3, 2, 'mestre' from fixture
union all
select game_id, 'segredo', 'bau', 'thorin', 'Segredo', 'outro', 5, 0, 'thorin' from fixture;
update public.depot_items set deleted_at = now() where id = 'lixo';

-- What load_depot_items read, as the handler sends it back.
create function pg_temp.reads(ids text[])
returns jsonb
language sql
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r ->> 'id', 'updatedAt', r ->> 'updated_at', 'live', (r ->> 'live')::boolean)), '[]'::jsonb)
    from jsonb_array_elements(public.load_depot_items((select game_id from fixture), ids)) r;
$$;

-- Commits revision + 1 with `moves`, after reading `ids`.
create function pg_temp.commit(revision integer, moves jsonb, ids text[])
returns text
language sql
as $$
  select public.commit_game_stock(
    (select game_id from fixture),
    revision,
    jsonb_build_object('version', 11, 'revision', revision + 1),
    '00000000-0000-0000-0000-00000000000b',
    'Thorin',
    '{"type":"garden_plant"}'::jsonb,
    '[]'::jsonb,
    moves,
    pg_temp.reads(ids)
  );
$$;
grant execute on function pg_temp.reads(text[]), pg_temp.commit(integer, jsonb, text[])
  to service_role, authenticated;

create function pg_temp.quantity(item text) returns integer language sql as $$
  select quantity from public.depot_items where id = item;
$$;
create function pg_temp.revision() returns integer language sql as $$
  select revision from public.games where id = (select game_id from fixture);
$$;
grant execute on function pg_temp.quantity(text), pg_temp.revision() to service_role, authenticated;

-- ---------------------------------------------------------------- the game function (service role)

set local role service_role;

select is(
  jsonb_array_length(public.load_depot_items((select game_id from fixture), array['semente', 'segredo', 'lixo'])),
  2,
  'load_depot_items never returns private items'
);
select is(
  (select r ->> 'live' from jsonb_array_elements(public.load_depot_items((select game_id from fixture), array['lixo'])) r),
  'false',
  'load_depot_items flags trashed items'
);

select is(pg_temp.commit(0, '[{"itemId":"semente","delta":-1,"mode":"strict"}]', array['semente']), 'ok', 'a spend commits');
select is(pg_temp.quantity('semente'), 0, 'the item can reach zero');
select is(pg_temp.revision(), 1, 'the game moves with the depot');

-- secondSpendIsRefused: the last seed is gone, the second planting finds none.
select is(pg_temp.commit(1, '[{"itemId":"semente","delta":-1,"mode":"strict"}]', array['semente']), 'stock_short', 'secondSpendIsRefused');
-- rollsBackOnShortage: one move fits, the other does not; nothing is kept.
select is(
  pg_temp.commit(1, '[{"itemId":"erva","delta":1,"mode":"strict"},{"itemId":"semente","delta":-1,"mode":"strict"}]', array['erva', 'semente']),
  'stock_short',
  'a shortage refuses the whole commit'
);
select is(pg_temp.revision(), 1, 'rollsBackOnShortage: the game keeps its revision');
select is(pg_temp.quantity('erva'), 99998, 'rollsBackOnShortage: the other move is undone');

select is(pg_temp.commit(1, '[{"itemId":"semente","delta":-3,"mode":"clamp"}]', array['semente']), 'ok', 'a master spend takes what there is');
select is(pg_temp.quantity('semente'), 0, 'clamp stops at zero');

select is(pg_temp.commit(2, '[{"itemId":"erva","delta":5,"mode":"strict"}]', array['erva']), 'ok', 'a gain commits');
select is(pg_temp.quantity('erva'), 99999, 'a gain stops at the limit');

select is(pg_temp.commit(3, '[{"itemId":"segredo","delta":-1,"mode":"clamp"}]', array[]::text[]), 'stock_missing', 'a private item cannot be spent');
select is(pg_temp.commit(3, '[{"itemId":"lixo","delta":-1,"mode":"clamp"}]', array[]::text[]), 'stock_missing', 'a trashed item cannot be spent');

-- A row that changed after the read: the names the rules logged may be stale.
create temporary table stale as select pg_temp.reads(array['erva']) as reads;
update public.depot_items set name = 'Menta', updated_at = now() + interval '1 second' where id = 'erva';
select is(
  public.commit_game_stock(
    (select game_id from fixture), 3, '{"version":11,"revision":4}'::jsonb,
    '00000000-0000-0000-0000-00000000000b', 'Thorin', '{}'::jsonb, '[]'::jsonb,
    '[]'::jsonb, (select reads from stale)
  ),
  'conflict',
  'a row changed since the read is a conflict'
);

reset role;

-- ---------------------------------------------------------------- clients

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select throws_ok(
  $$select public.commit_game_stock((select game_id from fixture), 3, '{}'::jsonb, '00000000-0000-0000-0000-00000000000b', 'x', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  '42501', null, 'authenticated cannot execute the function'
);
reset role;

select * from finish();
rollback;
