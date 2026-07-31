begin;

alter table public.location_search_profiles
  add column if not exists taxonomy_version integer not null default 1;

create index if not exists location_search_profiles_taxonomy_version_idx
  on public.location_search_profiles(taxonomy_version, profile_version, needs_review);

create or replace function public.enqueue_full_search_profile_rebuild(
  p_taxonomy_version integer default 2,
  p_reason text default 'taxonomy_v2_full_rebuild'
)
returns table(enqueued_count bigint, target_count bigint)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_enqueued bigint;
  v_target bigint;
begin
  select count(*) into v_target
  from public.locations l
  where l.active = true
    and l.is_searchable = true
    and coalesce(l.is_hidden, false) = false
    and coalesce(l.is_low_level, false) = false;

  with candidates as (
    select l.id as location_id
    from public.locations l
    left join public.location_search_profiles p on p.location_id = l.id
    where l.active = true
      and l.is_searchable = true
      and coalesce(l.is_hidden, false) = false
      and coalesce(l.is_low_level, false) = false
      and (
        p.location_id is null
        or p.profile_version < 4
        or p.taxonomy_version < p_taxonomy_version
        or p.needs_review = true
      )
  ), inserted as (
    insert into public.location_search_profile_refresh_queue(location_id, reason, status, available_at, updated_at)
    select c.location_id, p_reason, 'queued', now(), now()
    from candidates c
    where not exists (
      select 1
      from public.location_search_profile_refresh_queue q
      where q.location_id = c.location_id
        and q.status in ('queued','processing')
    )
    returning 1
  )
  select count(*) into v_enqueued from inserted;

  return query select v_enqueued, v_target;
end;
$$;

revoke all on function public.enqueue_full_search_profile_rebuild(integer,text) from public, anon, authenticated;
grant execute on function public.enqueue_full_search_profile_rebuild(integer,text) to service_role;

create or replace view public.search_profile_taxonomy_coverage
with (security_invoker = true)
as
select
  count(*) as total_profiles,
  count(*) filter (where taxonomy_version >= 2 and profile_version >= 4) as current_profiles,
  count(*) filter (where taxonomy_version < 2 or profile_version < 4) as stale_profiles,
  count(*) filter (where needs_review) as needs_review_profiles,
  count(*) filter (where coalesce(cardinality(canonical_terms),0) = 0) as empty_canonical_terms,
  max(updated_at) as latest_profile_update
from public.location_search_profiles;

revoke all on public.search_profile_taxonomy_coverage from anon, authenticated;
grant select on public.search_profile_taxonomy_coverage to service_role;

select * from public.enqueue_full_search_profile_rebuild(2, 'taxonomy_v2_full_rebuild');

commit;
