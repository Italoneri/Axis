-- Game entry links: one reusable link per table (the one sent to the Discord
-- group). Whoever opens it, logged in and not yet a member, either takes a
-- character nobody plays yet or creates their own. As with invites, only the
-- hash of the token is stored, and every write goes through the game Edge
-- Function with the service role.

create table public.join_links (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  -- Null: valid until revoked.
  expires_at timestamptz,
  revoked_at timestamptz
);

create index join_links_by_game on public.join_links (game_id, created_at desc);

alter table public.join_links enable row level security;
create policy "masters read their join links" on public.join_links
  for select to authenticated using (public.is_master(game_id));

revoke insert, update, delete, truncate on public.join_links from anon, authenticated;
revoke all on public.join_links from anon;

-- ---------------------------------------------------------------- writes (service role only)

create function public.create_join_link(
  target_game uuid,
  link_token_hash text,
  creator uuid,
  expires timestamptz
)
returns uuid
language sql
set search_path = ''
as $$
  insert into public.join_links (game_id, token_hash, created_by, expires_at)
  values (target_game, link_token_hash, creator, expires)
  returning id;
$$;

create function public.revoke_join_link(target_game uuid, link uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.join_links set revoked_at = now()
   where id = link and game_id = target_game and revoked_at is null;
  return found;
end;
$$;

-- 'ok', 'invalid', 'revoked' or 'expired', for a link read inside a transaction.
create function public.join_link_status(link public.join_links)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when link.id is null then 'invalid'
    when link.revoked_at is not null then 'revoked'
    when link.expires_at is not null and link.expires_at <= now() then 'expired'
    else 'ok'
  end;
$$;

-- What the "Entrar na Axis" screen needs: the game, whether the user is already
-- in it, and which characters already have a player. The state goes to the
-- Edge Function only, which sends back just the free characters.
create function public.peek_join(link_token_hash text, joining_user uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  link public.join_links;
  status text;
begin
  select * into link from public.join_links where token_hash = link_token_hash;
  status := public.join_link_status(link);
  if status <> 'ok' then
    return jsonb_build_object('status', status);
  end if;

  return (
    select jsonb_build_object(
      'status', 'ok',
      'game_id', g.id,
      'game_name', g.name,
      'state', g.state,
      'revision', g.revision,
      'is_member', exists (
        select 1 from public.players p where p.game_id = g.id and p.user_id = joining_user
      ),
      'taken', coalesce((
        select jsonb_agg(p.character_id) from public.players p
        where p.game_id = g.id and p.character_id is not null
      ), '[]'::jsonb)
    )
    from public.games g
    where g.id = link.game_id
  );
end;
$$;

-- Links the user to a character and saves the state the Edge Function computed
-- (the new character, or only the log line), in one transaction. Same
-- guarantees as accept_invite: one character per user in a game, one user per
-- character. status: 'ok', 'invalid', 'revoked', 'expired', 'already_member',
-- 'character_taken' or 'conflict' (someone saved first: compute again).
create function public.join_game(
  link_token_hash text,
  joining_user uuid,
  joined_character text,
  expected_revision integer,
  next_state jsonb,
  acting_name text,
  command jsonb,
  entries jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  link public.join_links;
  status text;
begin
  select * into link from public.join_links where token_hash = link_token_hash for share;
  status := public.join_link_status(link);
  if status <> 'ok' then
    return jsonb_build_object('status', status);
  end if;

  if exists (select 1 from public.players where game_id = link.game_id and user_id = joining_user) then
    return jsonb_build_object('status', 'already_member', 'game_id', link.game_id);
  end if;

  begin
    insert into public.players (game_id, user_id, role, character_id)
    values (link.game_id, joining_user, 'player', joined_character);
  exception when unique_violation then
    return jsonb_build_object('status', 'character_taken', 'game_id', link.game_id);
  end;

  if not public.commit_game_update(
    link.game_id, expected_revision, next_state, joining_user, acting_name, command, entries
  ) then
    -- Undo the link above: the caller computes the change again on the new state.
    delete from public.players where game_id = link.game_id and user_id = joining_user;
    return jsonb_build_object('status', 'conflict', 'game_id', link.game_id);
  end if;
  return jsonb_build_object('status', 'ok', 'game_id', link.game_id);
end;
$$;

-- The master unlinks a player: the character and its wallet stay, only the
-- link goes (the player can come back through the entry link).
-- status: 'ok', 'not_found' or 'conflict'.
create function public.unlink_player(
  target_game uuid,
  unlinked_user uuid,
  expected_revision integer,
  next_state jsonb,
  acting_user uuid,
  acting_name text,
  command jsonb,
  entries jsonb
)
returns text
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.players
   where game_id = target_game and user_id = unlinked_user and role = 'player'
   for update;
  if not found then
    return 'not_found';
  end if;
  if not public.commit_game_update(
    target_game, expected_revision, next_state, acting_user, acting_name, command, entries
  ) then
    return 'conflict';
  end if;
  delete from public.players where game_id = target_game and user_id = unlinked_user;
  return 'ok';
end;
$$;

revoke execute on function
  public.create_join_link(uuid, text, uuid, timestamptz),
  public.revoke_join_link(uuid, uuid),
  public.join_link_status(public.join_links),
  public.peek_join(text, uuid),
  public.join_game(text, uuid, text, integer, jsonb, text, jsonb, jsonb),
  public.unlink_player(uuid, uuid, integer, jsonb, uuid, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.create_join_link(uuid, text, uuid, timestamptz),
  public.revoke_join_link(uuid, uuid),
  public.join_link_status(public.join_links),
  public.peek_join(text, uuid),
  public.join_game(text, uuid, text, integer, jsonb, text, jsonb, jsonb),
  public.unlink_player(uuid, uuid, integer, jsonb, uuid, text, jsonb, jsonb)
  to service_role;

-- ---------------------------------------------------------------- the master's player list

-- Who plays what, with the name and e-mail of each login (auth.users is not
-- readable by clients). Masters only; anyone else gets no rows.
create function public.list_players(target_game uuid)
returns table (
  user_id uuid,
  role text,
  character_id text,
  joined_at timestamptz,
  display_name text,
  email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.user_id,
    p.role,
    p.character_id,
    p.joined_at,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
    u.email::text
  from public.players p
  join auth.users u on u.id = p.user_id
  where p.game_id = target_game and public.is_master(target_game)
  order by p.joined_at
  limit 200;
$$;

revoke execute on function public.list_players(uuid) from public, anon;
grant execute on function public.list_players(uuid) to authenticated;
