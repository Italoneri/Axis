-- Images attached to archive notes (see docs/plans/ARQUIVO.md, "Imagens anexadas
-- às notas"). The metadata lives in the note (images jsonb), so it follows the
-- note's RLS, trash and realtime; the files live in a private Storage bucket at
-- game_id/note_id/image_id.webp (and image_id.thumb.webp), guarded by the same
-- rule as the note: players never touch the files of the master's notes.

-- ---------------------------------------------------------------- metadata

-- Checked in full by the client's rules (src/systems/Archive.ts); the database
-- only bounds it.
alter table public.archive_notes
  add column images jsonb not null default '[]'::jsonb
  check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 12);

-- Importing a save now carries the images of each note.
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

  insert into public.archive_topics (game_id, id, name, icon, position, author_id, deleted_at)
  select target_game, t.id, t.name, t.icon, t.position, t.author_id, t.deleted_at
  from jsonb_to_recordset(topics) as t (
    id text, name text, icon text, position integer, author_id text, deleted_at timestamptz
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

-- ---------------------------------------------------------------- files

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('archive-images', 'archive-images', false, 2097152, array['image/webp', 'image/jpeg']);

-- Reads game_id/note_id from the object path. security definer: it must see
-- the visibility of the master's notes to refuse players without them seeing it.
--   read:  the note exists and the caller sees it; a file with no note, only the master.
--   write: a member, and the note is one the caller sees or does not exist yet
--          (images are uploaded while the note is still in the editor).
create function public.can_access_archive_image(object_name text, for_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := storage.foldername(object_name);
  target_game uuid;
  note_visibility text;
begin
  if coalesce(array_length(parts, 1), 0) <> 2
     or parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  target_game := parts[1]::uuid;
  if not public.is_member(target_game) then
    return false;
  end if;

  select n.visibility into note_visibility
  from public.archive_notes n
  where n.game_id = target_game and n.id = parts[2];
  if not found then
    return for_write or public.is_master(target_game);
  end if;
  return public.can_see_archive_note(target_game, note_visibility);
end;
$$;

revoke execute on function public.can_access_archive_image(text, boolean) from public, anon;
grant execute on function public.can_access_archive_image(text, boolean) to authenticated;

create policy "members read archive images they may see" on storage.objects
  for select to authenticated
  using (bucket_id = 'archive-images' and public.can_access_archive_image(name, false));
create policy "members add archive images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'archive-images' and public.can_access_archive_image(name, true));
-- Uploads use upsert, which updates an object already there.
create policy "members replace archive images" on storage.objects
  for update to authenticated
  using (bucket_id = 'archive-images' and public.can_access_archive_image(name, true))
  with check (bucket_id = 'archive-images' and public.can_access_archive_image(name, true));
create policy "members remove archive images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'archive-images' and public.can_access_archive_image(name, true));
