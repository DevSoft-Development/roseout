alter table public.consumer_profiles
  add column if not exists personalization_enabled boolean not null default true;

alter table public.consumer_profiles
  add column if not exists personalization_updated_at timestamptz;

comment on column public.consumer_profiles.personalization_enabled is
  'Whether prior TheOutHaven activity may be used to personalize search ranking for this consumer.';

comment on column public.consumer_profiles.personalization_updated_at is
  'When the consumer last changed their personalization preference.';


create or replace function public.get_search_personalization_backfill_users(p_limit integer default 50)
returns table(user_id uuid)
language sql stable security invoker set search_path=public as $$
  with candidates as (
    select a.user_id,max(a.created_at) latest
    from public.analytics_events a
    where a.user_id is not null
      and a.event_name in ('location_clicked','result_clicked','location_saved','result_saved')
    group by a.user_id
    union all
    select o.user_id,max(coalesce(o.completed_at,o.booked_at,o.created_at))
    from public.user_outings o
    where o.user_id is not null
    group by o.user_id
  ), latest as (
    select user_id,max(latest) latest from candidates group by user_id
  )
  select l.user_id
  from latest l
  left join public.consumer_profiles cp on cp.user_id=l.user_id
  left join public.user_search_preference_vectors v on v.user_id=l.user_id
  where coalesce(cp.personalization_enabled,true)=true
    and (v.user_id is null or v.calculated_at<l.latest or v.status<>'ready')
  order by l.latest desc
  limit greatest(1,least(coalesce(p_limit,50),250));
$$;

revoke all on function public.get_search_personalization_backfill_users(integer)
  from public,anon,authenticated;
grant execute on function public.get_search_personalization_backfill_users(integer)
  to service_role;
