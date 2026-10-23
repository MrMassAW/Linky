-- Fallback photo storage on Supabase Storage, used until Cloudflare R2 is configured
-- (VITE_R2_ENABLED unset). Objects live under photos/<user id>/...
-- Skipped automatically on databases without the storage schema (e.g. scripts/test-db.sh).
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema missing, skipping bucket setup';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('photos', 'photos', true, 512000, array['image/avif', 'image/webp', 'image/jpeg'])
  on conflict (id) do nothing;

  execute $p$create policy "photos: owners upload" on storage.objects for insert to authenticated
    with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy "photos: owners delete" on storage.objects for delete to authenticated
    using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
end $$;
