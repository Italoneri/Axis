-- Photos sent in game for characters, NPCs, materials and worlds (see
-- src/systems/GameImages.ts). The state only keeps a reference
-- (upload:<kind>/<id>/<image>.webp); the files live in a private bucket at
-- game_id/<kind>/<id>/<image>.webp (and <image>.thumb.webp), so the path alone
-- says whose photo it is:
--   read:  any member of the game;
--   write: the master, anywhere; a player, only under their own character.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-images', 'game-images', false, 307200, array['image/webp', 'image/jpeg']);

-- security definer: it looks up the caller's character in public.players.
create function public.can_access_game_image(object_name text, for_write boolean)
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
     or parts[2] not in ('character', 'npc', 'material', 'world') then
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

revoke execute on function public.can_access_game_image(text, boolean) from public, anon;
grant execute on function public.can_access_game_image(text, boolean) to authenticated;

create policy "members read game images" on storage.objects
  for select to authenticated
  using (bucket_id = 'game-images' and public.can_access_game_image(name, false));
create policy "owners add game images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'game-images' and public.can_access_game_image(name, true));
-- Uploads use upsert, which updates an object already there.
create policy "owners replace game images" on storage.objects
  for update to authenticated
  using (bucket_id = 'game-images' and public.can_access_game_image(name, true))
  with check (bucket_id = 'game-images' and public.can_access_game_image(name, true));
create policy "owners remove game images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'game-images' and public.can_access_game_image(name, true));
