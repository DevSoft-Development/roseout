-- Keep Supabase Data API reads available during a regional DR write fence while
-- rejecting mutating PostgREST requests before their main query executes.
create or replace function public.theouthaven_dr_pre_request()
returns void
language plpgsql
set search_path = ''
as $function$
declare
  request_method text := upper(coalesce(current_setting('request.method', true), ''));
  write_fence text := lower(coalesce(current_setting('theouthaven.dr_write_fence', true), 'off'));
begin
  if write_fence = 'on' and request_method in ('POST', 'PATCH', 'PUT', 'DELETE') then
    raise sqlstate '25006' using message = 'TheOutHaven DR write fence is active';
  end if;
end;
$function$;

comment on function public.theouthaven_dr_pre_request() is
  'Rejects mutating Supabase Data API requests while the regional DR write fence is active.';

alter role authenticator set pgrst.db_pre_request = 'public.theouthaven_dr_pre_request';
alter database postgres set "theouthaven.dr_write_fence" = 'off';
notify pgrst, 'reload config';
