-- Sub-topics in the Arquivo de registros (see docs/plans/ARQUIVO.md, "Sub-tópicos"):
-- a topic may sit under another one of the same game. Loops and names repeated
-- among siblings are refused by the client's rules (src/systems/Archive.ts); the
-- client also shows a looping topic at the top, so a hand-written loop hides nothing.

-- ---------------------------------------------------------------- parent

-- Emptying the trash deletes a parent for good: whatever was left under it moves
-- to the top instead of going with it (only parent_id is cleared, not game_id).
alter table public.archive_topics
  add column parent_id text,
  add constraint archive_topics_parent_fk
    foreign key (game_id, parent_id) references public.archive_topics (game_id, id)
    on delete set null (parent_id),
  add constraint archive_topics_not_own_parent check (parent_id <> id);

create index archive_topics_by_parent on public.archive_topics (game_id, parent_id);

-- ---------------------------------------------------------------- trash

-- A topic goes to the trash only when empty: no notes (the master's included)
-- and no sub-topics in use.
create or replace function public.archive_topic_must_be_empty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null and (
    exists (
      select 1 from public.archive_notes n
      where n.game_id = new.game_id and n.topic_id = new.id and n.deleted_at is null
    ) or exists (
      select 1 from public.archive_topics t
      where t.game_id = new.game_id and t.parent_id = new.id and t.deleted_at is null
    )
  ) then
    raise exception 'category_not_empty' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- import

-- Importing a save now carries where each topic sits. The foreign key is checked
-- at the end of the statement, so the order of the topics does not matter.
create or replace function public.replace_archive(target_game uuid, topics jsonb, notes jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_master(target_game) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  delete from public.archive_topics where game_id = target_game;

  insert into public.archive_topics (
    game_id, id, parent_id, name, icon, position, author_id, deleted_at
  )
  select target_game, t.id, t.parent_id, t.name, t.icon, t.position, t.author_id, t.deleted_at
  from jsonb_to_recordset(topics) as t (
    id text, parent_id text, name text, icon text, position integer, author_id text,
    deleted_at timestamptz
  );

  insert into public.archive_notes (
    game_id, id, topic_id, title, body, day, pinned, visibility, position,
    author_id, edited_by, created_at, updated_at, deleted_at, images
  )
  select target_game, n.id, n.topic_id, n.title, n.body, n.day, n.pinned, n.visibility, n.position,
         n.author_id, n.edited_by, n.created_at, n.updated_at, n.deleted_at,
         coalesce(n.images, '[]'::jsonb)
  from jsonb_to_recordset(notes) as n (
    id text, topic_id text, title text, body text, day integer, pinned boolean, visibility text,
    position integer, author_id text, edited_by text, created_at timestamptz,
    updated_at timestamptz, deleted_at timestamptz, images jsonb
  );
end;
$$;
