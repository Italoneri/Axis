-- Comércio do Entreposto (see src/systems/Shop.ts). The shop itself lives in
-- games.state; only what crosses into other tables needs SQL.

-- ---------------------------------------------------------------- equipment purchases

-- An equipment purchase saves the game and files the item in the buyer's depot
-- area in one transaction, so a conflict never leaves a paid item undelivered
-- (or a delivered item unpaid). Returns false on a revision conflict.
--
-- security definer: the depot rows are written past RLS, for whichever area
-- the purchase belongs to.
create function public.commit_shop_purchase(
  target_game uuid,
  expected_revision integer,
  next_state jsonb,
  acting_user uuid,
  acting_name text,
  command jsonb,
  entries jsonb,
  delivery jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  area_owner text := delivery ->> 'ownerId';
  shop_id text := left('entreposto-' || coalesce(delivery ->> 'ownerId', 'grupo'), 64);
  shop_section text;
begin
  if not public.commit_game_update(
    target_game, expected_revision, next_state, acting_user, acting_name, command, entries
  ) then
    return false;
  end if;

  -- Same lookup as deliverToDepot (shopSectionFor) in src/systems/Depot.ts: the
  -- server keeps no depot in memory. Section ids are client-chosen, so every
  -- step stays inside the delivery's area.
  select s.id into shop_section from public.depot_sections s
   where s.game_id = target_game and s.owner_id is not distinct from area_owner
     and s.deleted_at is null and s.id = shop_id;

  if shop_section is null then
    select s.id into shop_section from public.depot_sections s
     where s.game_id = target_game and s.owner_id is not distinct from area_owner
       and s.deleted_at is null and s.name = 'Compras do Entreposto'
     order by s.position, s.id
     limit 1;
  end if;

  if shop_section is null then
    update public.depot_sections s set deleted_at = null
     where s.game_id = target_game and s.owner_id is not distinct from area_owner
       and s.id = shop_id
    returning s.id into shop_section;
  end if;

  if shop_section is null then
    insert into public.depot_sections (game_id, id, name, owner_id, position, author_id)
    select target_game,
           case
             when exists (
               select 1 from public.depot_sections t where t.game_id = target_game and t.id = shop_id
             ) then left('entreposto-' || (delivery ->> 'itemId'), 64)
             else shop_id
           end,
           'Compras do Entreposto',
           area_owner,
           coalesce(max(s.position) + 1, 0),
           delivery ->> 'authorId'
      from public.depot_sections s
     where s.game_id = target_game and s.owner_id is not distinct from area_owner
       and s.deleted_at is null
    returning id into shop_section;
  end if;

  insert into public.depot_items (
    game_id, id, section_id, owner_id, name, kind, quantity, notes, position, author_id
  )
  select target_game,
         delivery ->> 'itemId',
         shop_section,
         area_owner,
         delivery ->> 'name',
         delivery ->> 'kind',
         (delivery ->> 'quantity')::integer,
         delivery ->> 'notes',
         coalesce(max(i.position) + 1, 0),
         delivery ->> 'authorId'
    from public.depot_items i
   where i.game_id = target_game and i.section_id = shop_section;
  return true;
end;
$$;

revoke execute on function
  public.commit_shop_purchase(uuid, integer, jsonb, uuid, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.commit_shop_purchase(uuid, integer, jsonb, uuid, text, jsonb, jsonb, jsonb)
  to service_role;

-- ---------------------------------------------------------------- photos

-- Shop items get photos too (upload:shop_item/<id>/<image>.webp): the master
-- writes them, every member reads them. Same body as in
-- 20261013000000_game_images.sql, with 'shop_item' added to the kinds.
create or replace function public.can_access_game_image(object_name text, for_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := storage.foldername(object_name);
  target_game uuid;
begin
  if coalesce(array_length(parts, 1), 0) <> 3
     or parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or parts[2] not in ('character', 'npc', 'material', 'world', 'shop_item') then
    return false;
  end if;
  target_game := parts[1]::uuid;
  if not for_write then
    return public.is_member(target_game);
  end if;
  if public.is_master(target_game) then
    return true;
  end if;
  return parts[2] = 'character' and exists (
    select 1 from public.players p
    where p.game_id = target_game
      and p.user_id = (select auth.uid())
      and p.character_id = parts[3]
  );
end;
$$;
