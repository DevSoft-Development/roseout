-- This assumes the bucket already exists:
-- storage bucket name: location-images

-- Make sure the existing bucket is public readable.
update storage.buckets
set public = true
where id = 'location-images';

-- Public read policy for location-images bucket.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public read location-images'
  ) then
    create policy "Public read location-images"
    on storage.objects
    for select
    using (bucket_id = 'location-images');
  end if;
end $$;

-- Service role can manage location-images bucket.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Service role manage location-images'
  ) then
    create policy "Service role manage location-images"
    on storage.objects
    for all
    using (
      bucket_id = 'location-images'
      and auth.role() = 'service_role'
    )
    with check (
      bucket_id = 'location-images'
      and auth.role() = 'service_role'
    );
  end if;
end $$;
