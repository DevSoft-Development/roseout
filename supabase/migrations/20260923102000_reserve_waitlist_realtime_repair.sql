-- Re-assert Reserve waitlist realtime publication after production/DR parity audit.
-- Safe and idempotent in Virginia and Oregon.

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reservation_waitlist'
  ) then
    alter publication supabase_realtime add table public.reservation_waitlist;
  end if;
end
$$;
