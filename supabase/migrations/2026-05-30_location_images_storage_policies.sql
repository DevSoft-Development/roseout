insert into storage.buckets (id, name, public)
values ('location-images', 'location-images', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Public read location images') then
    create policy "Public read location images" on storage.objects for select using (bucket_id = 'location-images');
  end if;
exception when others then
  null;
end $$;
