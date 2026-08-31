-- Keep Supabase Data API reads available during a regional DR write fence while
-- rejecting mutating PostgREST requests before their main query executes.
-- The Data API guard derives its state from the same database-level read-only
-- setting used by the rest of the DR fence, so there is only one source of truth.
create or replace function public.theouthaven_dr_pre_request()
returns void
language plpgsql
set search_path = ''
as $function$
declare
  request_method text := upper(coalesce(current_setting('request.method', true), ''));
  write_fence boolean := false;
begin
  select exists (
    select 1
    from pg_catalog.pg_db_role_setting s
    join pg_catalog.pg_database d on d.oid = s.setdatabase
    where d.datname = current_database()
      and s.setrole = 0
      and coalesce(array_to_string(s.setconfig, ','), '') like '%default_transaction_read_only=on%'
  ) into write_fence;

  if write_fence and request_method in ('POST', 'PATCH', 'PUT', 'DELETE') then
    raise sqlstate '25006' using message = 'TheOutHaven DR write fence is active';
  end if;
end;
$function$;

comment on function public.theouthaven_dr_pre_request() is
  'Rejects mutating Supabase Data API requests while the database-level DR read-only fence is active.';

alter role authenticator set pgrst.db_pre_request = 'public.theouthaven_dr_pre_request';
notify pgrst, 'reload config';
