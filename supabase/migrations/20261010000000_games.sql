-- Phase 3: games shared by a master and their players.
--
-- Clients only READ, through RLS. Every write goes through the `game` Edge
-- Function, which runs the game rules (applyCommand) and calls the functions
-- below with the service role. No table has an insert/update/delete policy.

-- ---------------------------------------------------------------- tables

create table public.games (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  -- The whole GameState: a versioned JSON document (state->>'version'), so new
  -- features (NPCs…) arrive as a save migration in the code, not a table change.
  state jsonb not null,
  revision integer not null default 0 check (revision >= 0),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.players (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('master', 'player')),
  -- The character this player controls (an id inside games.state); the master has none.
  character_id text,
  joined_at timestamptz not null default now(),
  primary key (game_id, user_id),
  constraint players_character_matches_role check ((role = 'master') = (character_id is null))
);

create unique index players_one_user_per_character
  on public.players (game_id, character_id)
  where character_id is not null;

create index players_by_user on public.players (user_id);

-- Full history. games.state keeps only the latest 200 entries for quick display.
create table public.game_log (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  revision integer not null,
  user_id uuid references auth.users (id) on delete set null,
  -- Display name at the time ("Mestre" or the character's name).
  actor text,
  command jsonb not null,
  -- The LogEntry objects this command added to the state.
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index game_log_by_game on public.game_log (game_id, id desc);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  character_id text not null,
  -- sha256 of the token in the link; the token itself is never stored.
  token_hash text not null unique,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by uuid references auth.users (id),
  used_at timestamptz,
  revoked_at timestamptz
);

create index invites_by_game on public.invites (game_id, created_at desc);

-- ---------------------------------------------------------------- membership helpers

-- security definer: policies on `players` call these without recursing into its own RLS.
create function public.is_member(target_game uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players p
    where p.game_id = target_game and p.user_id = (select auth.uid())
  );
$$;

create function public.is_master(target_game uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players p
    where p.game_id = target_game and p.user_id = (select auth.uid()) and p.role = 'master'
  );
$$;

revoke execute on function public.is_member(uuid), public.is_master(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.is_master(uuid) to authenticated;

-- ---------------------------------------------------------------- RLS: read-only for members

alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.game_log enable row level security;
alter table public.invites enable row level security;

create policy "members read their games" on public.games
  for select to authenticated using (public.is_member(id));

create policy "members read who plays their games" on public.players
  for select to authenticated using (public.is_member(game_id));

create policy "members read the history" on public.game_log
  for select to authenticated using (public.is_member(game_id));

create policy "masters read their invites" on public.invites
  for select to authenticated using (public.is_master(game_id));

-- Defense in depth: even without policies, clients get no write privilege at all.
revoke insert, update, delete, truncate on public.games, public.players, public.game_log, public.invites
  from anon, authenticated;
revoke all on public.games, public.players, public.game_log, public.invites from anon;

-- ---------------------------------------------------------------- writes (service role only)

-- Applies a change computed by the Edge Function, only if nobody saved first.
-- Returns false on a revision conflict (the function answers 409).
create function public.commit_game_update(
  target_game uuid,
  expected_revision integer,
  next_state jsonb,
  acting_user uuid,
  acting_name text,
  command jsonb,
  entries jsonb
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  next_revision integer := (next_state ->> 'revision')::integer;
begin
  if next_revision is distinct from expected_revision + 1 then
    raise exception 'next state must have revision %, got %', expected_revision + 1, next_revision;
  end if;

  update public.games
     set state = next_state, revision = next_revision, updated_at = now()
   where id = target_game and revision = expected_revision;
  if not found then
    return false;
  end if;

  insert into public.game_log (game_id, revision, user_id, actor, command, entries)
  values (target_game, next_revision, acting_user, acting_name, command, entries);
  return true;
end;
$$;

-- Creates a game and makes its creator the master, in one transaction.
create function public.create_game(game_name text, initial_state jsonb, owner uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_game uuid;
begin
  insert into public.games (name, state, revision, created_by)
  values (game_name, initial_state, coalesce((initial_state ->> 'revision')::integer, 0), owner)
  returning id into new_game;

  insert into public.players (game_id, user_id, role) values (new_game, owner, 'master');
  return new_game;
end;
$$;

-- Consumes an invite and links the user to its character. A character has one
-- player at a time: accepting a new invite moves it away from the previous one.
-- Returns 'ok', 'invalid', 'expired', 'used', 'revoked' or 'is_master'.
create function public.accept_invite(invite_token_hash text, accepting_user uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  invite public.invites%rowtype;
begin
  select * into invite from public.invites where token_hash = invite_token_hash for update;
  if not found then return 'invalid'; end if;
  if invite.revoked_at is not null then return 'revoked'; end if;
  if invite.used_at is not null then return 'used'; end if;
  if invite.expires_at <= now() then return 'expired'; end if;
  if exists (
    select 1 from public.players
    where game_id = invite.game_id and user_id = accepting_user and role = 'master'
  ) then
    return 'is_master';
  end if;

  delete from public.players
   where game_id = invite.game_id and character_id = invite.character_id and user_id <> accepting_user;
  insert into public.players (game_id, user_id, role, character_id)
  values (invite.game_id, accepting_user, 'player', invite.character_id)
  on conflict (game_id, user_id) do update set character_id = excluded.character_id;

  update public.invites set used_by = accepting_user, used_at = now() where id = invite.id;
  return 'ok';
end;
$$;

revoke execute on function
  public.commit_game_update(uuid, integer, jsonb, uuid, text, jsonb, jsonb),
  public.create_game(text, jsonb, uuid),
  public.accept_invite(text, uuid)
  from public, anon, authenticated;
grant execute on function
  public.commit_game_update(uuid, integer, jsonb, uuid, text, jsonb, jsonb),
  public.create_game(text, jsonb, uuid),
  public.accept_invite(text, uuid)
  to service_role;

-- ---------------------------------------------------------------- realtime

-- Realtime respects the RLS above: only members receive their game's changes.
alter publication supabase_realtime add table public.games;
