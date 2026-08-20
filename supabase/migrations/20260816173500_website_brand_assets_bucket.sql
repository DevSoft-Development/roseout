insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'website-brand-assets',
  'website-brand-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public read website brand assets'
  ) then
    create policy "Public read website brand assets"
      on storage.objects for select
      using (bucket_id = 'website-brand-assets');
  end if;
exception when others then
  null;
end $$;
