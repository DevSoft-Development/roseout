begin;

create or replace function public.claim_location_search_profile_refresh_queue(
  p_worker text,
  p_limit integer default 50,
  p_lease_seconds integer default 120
)
returns setof public.location_search_profile_refresh_queue
language sql
security invoker
set search_path = public
as $$
  with candidates as (
    select q.id
    from public.location_search_profile_refresh_queue q
    where q.attempts < q.max_attempts
      and (
        (q.status = 'pending' and q.available_at <= now())
        or (
          q.status = 'processing'
          and q.lease_expires_at is not null
          and q.lease_expires_at < now()
        )
      )
    order by q.available_at, q.created_at, q.id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 50), 1), 250)
  ), claimed as (
    update public.location_search_profile_refresh_queue q
    set
      status = 'processing',
      attempts = q.attempts + 1,
      locked_at = now(),
      locked_by = p_worker,
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 30)),
      updated_at = now()
    from candidates c
    where q.id = c.id
    returning q.*
  )
  select * from claimed;
$$;

revoke all
on function public.claim_location_search_profile_refresh_queue(text, integer, integer)
from public, anon, authenticated;

grant execute
on function public.claim_location_search_profile_refresh_queue(text, integer, integer)
to service_role;

create or replace function public.set_search_profile_taxonomy_version()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.profile_version >= 4 then
    new.taxonomy_version := greatest(coalesce(new.taxonomy_version, 1), 2);
  end if;
  return new;
end;
$$;

drop trigger if exists set_search_profile_taxonomy_version
on public.location_search_profiles;

create trigger set_search_profile_taxonomy_version
before insert or update of profile_version
on public.location_search_profiles
for each row
execute function public.set_search_profile_taxonomy_version();

create or replace view public.search_profile_refresh_queue_health
with (security_invoker = true)
as
select
  count(*) filter (where status = 'pending') as pending_count,
  count(*) filter (where status = 'processing') as processing_count,
  count(*) filter (where status = 'succeeded') as succeeded_count,
  count(*) filter (where status = 'failed') as failed_count,
  count(*) filter (
    where status = 'pending'
      and attempts = 0
      and available_at < now() - interval '10 minutes'
  ) as stalled_unattempted_count,
  min(created_at) filter (where status = 'pending') as oldest_pending_created_at,
  max(updated_at) as latest_queue_update
from public.location_search_profile_refresh_queue;

revoke all on public.search_profile_refresh_queue_health from anon, authenticated;
grant select on public.search_profile_refresh_queue_health to service_role;

commit;
