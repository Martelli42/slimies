-- ============================================================================
-- Avatar storage.
--
-- One public bucket; each player may only write inside a folder named after
-- their own user id. Wrapped in guards so the migration set can also be applied
-- to a plain PostgreSQL server (CI) that has no `storage` schema.
-- ============================================================================

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present — skipping avatar bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 2097152,
          array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  -- Anyone signed in can read avatars; only the owner can write their own.
  execute $policy$
    drop policy if exists "avatars are readable" on storage.objects;
    create policy "avatars are readable" on storage.objects
      for select using (bucket_id = 'avatars');

    drop policy if exists "players upload their own avatar" on storage.objects;
    create policy "players upload their own avatar" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );

    drop policy if exists "players replace their own avatar" on storage.objects;
    create policy "players replace their own avatar" on storage.objects
      for update to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );

    drop policy if exists "players delete their own avatar" on storage.objects;
    create policy "players delete their own avatar" on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  $policy$;
end $$;
