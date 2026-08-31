insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'career-resumes',
  'career-resumes',
  false,
  5242880,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "service role manages career resumes" on storage.objects;
create policy "service role manages career resumes"
on storage.objects
for all
using (bucket_id = 'career-resumes' and auth.role() = 'service_role')
with check (bucket_id = 'career-resumes' and auth.role() = 'service_role');
