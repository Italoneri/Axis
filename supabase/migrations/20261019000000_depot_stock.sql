-- Estufa e Laboratório usando o Depósito como estoque (see docs/plans/DEPOSITO.md).
-- Crops and recipes may point at items of the group's depot: planting and
-- brewing spend from them, harvesting and collecting add to them, and the game
-- and the depot are saved together.

-- ---------------------------------------------------------------- quantity 0

-- A seed that runs out stays linked: the item shows "×0 em falta" instead of disappearing.
alter table public.depot_items
  drop constraint depot_items_quantity_check,
  add constraint depot_items_quantity_check check (quantity between 0 and 99999);

-- ---------------------------------------------------------------- reading the items a command uses

-- The group's items among `item_ids`, for the rules (applyCommand) to read
-- names and quantities before they run. Private items never leave here: they
-- behave as missing. `live`: the item and its section are in use.
create function public.load_depot_items(target_game uuid, item_ids text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'name', i.name,
        'quantity', i.quantity,
        'live', i.deleted_at is null and s.deleted_at is null,
        'updated_at', i.updated_at
      )
      order by i.id
    ),
    '[]'::jsonb
  )
  from public.depot_items i
  join public.depot_sections s on s.game_id = i.game_id and s.id = i.section_id
  where i.game_id = target_game and i.id = any (item_ids) and i.owner_id is null;
$$;

revoke execute on function public.load_depot_items(uuid, text[]) from public, anon, authenticated;
grant execute on function public.load_depot_items(uuid, text[]) to service_role;

-- ---------------------------------------------------------------- committing game and depot together

-- Saves the game and moves the depot items in one transaction. `reads` are the
-- rows the rules read ({ id, updatedAt, live }); `moves` are { itemId, delta, mode }.
-- Returns:
--   'ok';
--   'conflict'       the revision moved on, or a read row changed since it was read;
--   'stock_short'    a strict spend found too little (someone took it first);
--   'stock_missing'  a spend found the item gone, private or in the trash.
-- Any refusal leaves both the game and the depot as they were. Gains on an
-- item that is gone are skipped (the rules already logged them as lost).
create function public.commit_game_stock(
  target_game uuid,
  expected_revision integer,
  next_state jsonb,
  acting_user uuid,
  acting_name text,
  command jsonb,
  entries jsonb,
  moves jsonb,
  reads jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  move record;
  item record;
begin
  -- One stable order for every lock, so two commits on the same items never deadlock.
  perform 1 from public.depot_items i
   where i.game_id = target_game
     and i.id in (
       select m ->> 'itemId' from jsonb_array_elements(moves) m
       union
       select r ->> 'id' from jsonb_array_elements(reads) r
     )
   order by i.id
     for update;

  if exists (
    select 1
      from jsonb_to_recordset(reads) as r(id text, "updatedAt" timestamptz, live boolean)
      left join public.depot_items i
        on i.game_id = target_game and i.id = r.id and i.owner_id is null
      left join public.depot_sections s on s.game_id = i.game_id and s.id = i.section_id
     where i.id is null
        or i.updated_at is distinct from r."updatedAt"
        -- Sending to the trash keeps updated_at, so it is compared on its own.
        or (i.deleted_at is null and s.deleted_at is null) is distinct from r.live
  ) then
    return 'conflict';
  end if;

  begin
    if not public.commit_game_update(
      target_game, expected_revision, next_state, acting_user, acting_name, command, entries
    ) then
      return 'conflict';
    end if;

    for move in
      select * from jsonb_to_recordset(moves) as m("itemId" text, delta integer, mode text)
       order by "itemId"
    loop
      select i.quantity into item
        from public.depot_items i
        join public.depot_sections s on s.game_id = i.game_id and s.id = i.section_id
       where i.game_id = target_game and i.id = move."itemId"
         and i.owner_id is null and i.deleted_at is null and s.deleted_at is null;

      if not found then
        if move.delta < 0 then
          raise exception 'stock_missing' using errcode = 'P0001';
        end if;
        continue;
      end if;

      if move.mode = 'strict' and item.quantity + move.delta < 0 then
        raise exception 'stock_short' using errcode = 'P0001';
      end if;

      update public.depot_items i
         set quantity = least(99999, greatest(0, i.quantity + move.delta)),
             updated_at = now()
       where i.game_id = target_game and i.id = move."itemId";
    end loop;
  exception
    -- Leaving this block undoes the game update and every move made so far.
    when sqlstate 'P0001' then
      if sqlerrm in ('stock_short', 'stock_missing') then
        return sqlerrm;
      end if;
      raise;
  end;
  return 'ok';
end;
$$;

revoke execute on function
  public.commit_game_stock(uuid, integer, jsonb, uuid, text, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.commit_game_stock(uuid, integer, jsonb, uuid, text, jsonb, jsonb, jsonb, jsonb)
  to service_role;
