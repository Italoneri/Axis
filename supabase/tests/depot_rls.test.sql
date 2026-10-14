-- Run with `npx supabase test db` (needs `npx supabase start`, which needs Docker).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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
  $$insert into public.depot_sections (game_id, id, name, owner_id, author_id)
    select game_id, s.id, s.name, s.owner, 'mestre' from fixture,
    (values ('pocoes', 'Poções', null), ('mochila-bia', 'Mochila', 'bia')) as s (id, name, owner)$$,
  'the master creates a shared section and a section in a private area'
);
select lives_ok(
  $$insert into public.depot_items (game_id, id, section_id, owner_id, name, kind, quantity, author_id)
    select game_id, 'cura', 'pocoes', null, 'Poção de cura', 'pocao', 3, 'mestre' from fixture$$,
  'the master stores an item in the shared depot'
);
select lives_ok(
  $$insert into public.depot_items (game_id, id, section_id, owner_id, name, kind, quantity, author_id)
    select game_id, 'adaga', 'mochila-bia', 'bia', 'Adaga +1', 'equipamento', 1, 'mestre' from fixture$$,
  'the master stores an item in a private area'
);

-- ---------------------------------------------------------------- a player (Thorin)

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is(
  (select array_agg(id order by id) from public.depot_sections),
  array['pocoes'],
  'a player never receives another character''s private sections'
);
select is(
  (select array_agg(id order by id) from public.depot_items),
  array['cura'],
  'a player never receives another character''s private items'
);
select lives_ok(
  $$insert into public.depot_sections (game_id, id, name, owner_id, author_id)
    select game_id, 'bau-thorin', 'Baú', 'thorin', 'thorin' from fixture$$,
  'a player opens a section in their own private area'
);
select throws_ok(
  $$insert into public.depot_sections (game_id, id, name, owner_id, author_id)
    select game_id, 'x', 'Hack', 'bia', 'thorin' from fixture$$,
  '42501', null, 'a player cannot open a section in another character''s area'
);
select lives_ok(
  $$insert into public.depot_items (game_id, id, section_id, owner_id, name, kind, quantity, author_id)
    select game_id, 'escudo', 'bau-thorin', 'thorin', 'Escudo', 'equipamento', 1, 'thorin' from fixture$$,
  'a player stores an item in their own area'
);
select throws_ok(
  $$insert into public.depot_items (game_id, id, section_id, owner_id, name, kind, quantity, author_id)
    select game_id, 'y', 'mochila-bia', null, 'Hack', 'outro', 1, 'thorin' from fixture$$,
  '42501', null, 'an item cannot claim another area than its section''s'
);
select lives_ok(
  $$update public.depot_items set quantity = 2, edited_by = 'thorin' where id = 'cura'$$,
  'a player edits an item of the shared depot'
);
select lives_ok(
  $$update public.depot_items set section_id = 'bau-thorin', owner_id = 'thorin' where id = 'cura'$$,
  'a player takes a shared item into their own area'
);
select throws_ok(
  $$update public.depot_items set section_id = 'mochila-bia', owner_id = 'bia' where id = 'escudo'$$,
  '42501', null, 'a player cannot move an item into another character''s area'
);
select throws_ok(
  $$update public.depot_sections set owner_id = null where id = 'bau-thorin'$$,
  '42501', null, 'a section never changes area'
);
-- RLS hides the row from the update: nothing changes (checked as the master below).
select lives_ok(
  $$update public.depot_items set name = 'hack' where id = 'adaga'$$,
  'a player editing another character''s item reaches nothing'
);
select throws_ok(
  $$update public.depot_sections set deleted_at = now() where id = 'bau-thorin'$$,
  '23514', 'category_not_empty', 'a section with items cannot go to the trash'
);
select lives_ok(
  $$update public.depot_sections set deleted_at = now() where id = 'pocoes'$$,
  'a player sends an empty shared section to the trash'
);
select lives_ok(
  $$delete from public.depot_items where id = 'escudo'$$,
  'a player deleting an item reaches nothing'
);
select isnt_empty(
  $$select 1 from public.depot_items where id = 'escudo'$$,
  'a player cannot empty the trash'
);
select throws_ok(
  $$select public.replace_depot((select game_id from fixture), '[]', '[]')$$,
  '42501', null, 'a player cannot replace the depot'
);

-- ---------------------------------------------------------------- another player (Bia)

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}';

select is(
  (select array_agg(id order by id) from public.depot_items),
  array['adaga'],
  'another player sees only the shared depot and their own area'
);

-- ---------------------------------------------------------------- strangers and the master

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select is_empty('select 1 from public.depot_sections', 'a stranger reads no section');
select is_empty('select 1 from public.depot_items', 'a stranger reads no item');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(
  (select name from public.depot_items where id = 'adaga'),
  'Adaga +1',
  'the private item is untouched'
);
select lives_ok(
  $$delete from public.depot_sections where deleted_at is not null$$,
  'the master empties the trash'
);
reset role;

select * from finish();
rollback;
