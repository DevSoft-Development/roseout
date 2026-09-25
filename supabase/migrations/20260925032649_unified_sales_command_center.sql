alter table public.gtm_location_state
  add column if not exists product_gaps jsonb not null default '[]'::jsonb,
  add column if not exists recommended_product_key text,
  add column if not exists recommended_product_reason text,
  add column if not exists product_gap_evaluated_at timestamptz,
  add column if not exists product_gap_version integer not null default 1;

create index if not exists gtm_location_state_recommended_product_idx
  on public.gtm_location_state (recommended_product_key, opportunity_score desc)
  where suppressed = false and recommended_product_key is not null;

create index if not exists crm_activities_sales_actor_time_idx
  on public.crm_activities (actor_user_id, occurred_at desc)
  where location_id is not null;

create index if not exists crm_opportunities_sales_owner_status_idx
  on public.crm_opportunities (owner_user_id, status, updated_at desc)
  where archived_at is null;

create or replace function public.admin_crm_sales_leadership_summary(
  p_since timestamptz default (now() - interval '30 days')
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
with territory_assignment as (
  select t.owner_user_id, lt.location_id
  from public.crm_location_territories lt
  join public.crm_territories t on t.id = lt.territory_id
  where t.status = 'active' and t.owner_user_id is not null
),
assigned as (
  select owner_user_id, count(distinct location_id)::int as assigned_locations
  from territory_assignment group by owner_user_id
),
activity as (
  select
    a.actor_user_id as owner_user_id,
    count(distinct a.location_id)::int as touched_locations,
    count(distinct a.location_id) filter (
      where a.activity_type in ('email','sms','phone_call','meeting','site_visit','social_message','claim_sent','proposal_sent')
    )::int as contacted_locations,
    max(coalesce(a.occurred_at, a.created_at)) as last_touch_at
  from public.crm_activities a
  where a.actor_user_id is not null
    and a.location_id is not null
    and coalesce(a.occurred_at, a.created_at) >= p_since
  group by a.actor_user_id
),
opportunity as (
  select
    o.owner_user_id,
    count(*) filter (where o.status = 'open')::int as open_opportunities,
    count(*) filter (where o.status = 'won' and coalesce(o.actual_close_date::timestamptz, o.updated_at) >= p_since)::int as wins,
    count(*) filter (where o.status = 'lost' and coalesce(o.actual_close_date::timestamptz, o.updated_at) >= p_since)::int as losses,
    coalesce(sum(coalesce(o.amount,0)) filter (where o.status = 'won' and coalesce(o.actual_close_date::timestamptz, o.updated_at) >= p_since),0)::numeric as won_value
  from public.crm_opportunities o
  where o.archived_at is null and o.owner_user_id is not null
  group by o.owner_user_id
),
owners as (
  select owner_user_id from assigned
  union select owner_user_id from activity
  union select owner_user_id from opportunity
),
rep_rows as (
  select
    owners.owner_user_id,
    coalesce(assigned.assigned_locations,0) as assigned_locations,
    coalesce(activity.touched_locations,0) as touched_locations,
    coalesce(activity.contacted_locations,0) as contacted_locations,
    coalesce(opportunity.open_opportunities,0) as open_opportunities,
    coalesce(opportunity.wins,0) as wins,
    coalesce(opportunity.losses,0) as losses,
    coalesce(opportunity.won_value,0) as won_value,
    activity.last_touch_at
  from owners
  left join assigned using (owner_user_id)
  left join activity using (owner_user_id)
  left join opportunity using (owner_user_id)
),
totals as (
  select
    (select count(*)::int from public.gtm_location_state where suppressed = false) as observed_locations,
    (select count(*)::int from public.gtm_location_state where suppressed = false and association_level = 'full') as active_sales_locations,
    (select count(*)::int from public.crm_opportunities where archived_at is null and status = 'open') as open_opportunities,
    (select count(*)::int from public.crm_opportunities where archived_at is null and status = 'won' and coalesce(actual_close_date::timestamptz, updated_at) >= p_since) as wins,
    (select count(*)::int from public.crm_opportunities where archived_at is null and status = 'lost' and coalesce(actual_close_date::timestamptz, updated_at) >= p_since) as losses
)
select jsonb_build_object(
  'since', p_since,
  'totals', to_jsonb(totals),
  'reps', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'userId', owner_user_id,
        'assignedLocations', assigned_locations,
        'touchedLocations', touched_locations,
        'contactedLocations', contacted_locations,
        'openOpportunities', open_opportunities,
        'wins', wins,
        'losses', losses,
        'wonValue', won_value,
        'lastTouchAt', last_touch_at
      )
      order by wins desc, contacted_locations desc, assigned_locations desc
    ) from rep_rows
  ), '[]'::jsonb)
)
from totals;
$$;

revoke all on function public.admin_crm_sales_leadership_summary(timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_crm_sales_leadership_summary(timestamptz)
  to service_role;

comment on column public.gtm_location_state.product_gaps is
  'Explainable product-gap recommendations for the unified sales workspace. Derived from canonical location and CRM signals.';
comment on function public.admin_crm_sales_leadership_summary(timestamptz) is
  'Service-role-only aggregate for unified sales leadership reporting without loading location-level activity into application memory.';
