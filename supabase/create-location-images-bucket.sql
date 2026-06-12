insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'location-images',
  'location-images',
  true,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read policy for location images.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public read location images'
  ) then
    create policy "Public read location images"
    on storage.objects
    for select
    using (bucket_id = 'location-images');
  end if;
end $$;
