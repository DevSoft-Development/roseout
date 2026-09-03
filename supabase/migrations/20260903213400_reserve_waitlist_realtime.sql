-- Host View subscribes only to location-scoped waitlist changes.
-- Keep the publication additive and idempotent for Virginia/Oregon parity.
do $$
begin
  if exists (
    select 1
      from pg_publication
     where pubname = 'supabase_realtime'
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