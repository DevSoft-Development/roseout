-- Scale the Admin Locations CRM lifecycle for 100k+ locations.
-- Lifecycle classification and aggregation stay inside Postgres; the Admin app
-- only receives bounded page rows plus small aggregate payloads.

create index if not exists idx_locations_admin_crm_active_updated_at
  on public.locations (updated_at desc, id)
  where deleted_at is null;

create index if not exists idx_locations_admin_crm_search_blob_trgm
  on public.locations using gin (
    (
      coalesce(name, '') || ' ' ||
      coalesce(business_name, '') || ' ' ||
      coalesce(restaurant_name, '') || ' ' ||
      coalesce(activity_name, '') || ' ' ||
      coalesce(address, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(state, '') || ' ' ||
      coalesce(zip_code, '') || ' ' ||
      coalesce(phone, '') || ' ' ||
      coalesce(owner_email, '') || ' ' ||
      coalesce(claimed_by_email, '')
    ) gin_trgm_ops
  )
  where deleted_at is null;

create index if not exists crm_opportunities_location_active_updated_idx
  on public.crm_opportunities (primary_location_id, updated_at desc)
  where archived_at is null;

create or replace function public.admin_location_customer_lifecycle_page(
  p_query text default null,
  p_stage text default null,
  p_health text default null,
  p_page integer default 1,
  p_page_size integer default 50,
  p_permitted_location_ids uuid[] default null,
  p_include_rows boolean default true,
  p_include_board boolean default true
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
with params as (
  select
    nullif(btrim(p_query), '') as q,
    case when p_stage is null or p_stage = '' or p_stage = 'all' then null else p_stage end as stage,
    case when p_health is null or p_health = '' or p_health = 'all' then null else p_health end as health,
    greatest(coalesce(p_page, 1), 1) as page_no,
    least(greatest(coalesce(p_page_size, 50), 1), 100) as page_size
),
signals as (
  select
    l.id,
    coalesce(nullif(l.name, ''), nullif(l.business_name, ''), nullif(l.restaurant_name, ''), nullif(l.activity_name, ''), 'Unnamed location') as display_name,
    l.address,
    l.city,
    l.state,
    l.zip_code,
    l.phone,
    l.website,
    coalesce(l.owner_email, l.claimed_by_email) as owner_email,
    l.claim_status,
    l.subscription_status,
    l.subscription_plan,
    l.plan,
    l.plan_status,
    l.current_period_end,
    l.next_billing_date,
    l.partner_plan_price_cents,
    l.subscription_interval,
    l.next_action,
    l.next_action_due_at,
    l.updated_at,
    l.created_at,
    l.opportunity_score,
    l.engagement_score,
    l.churn_risk_score,
    l.churn_risk,
    l.retention_score,
    l.partner_activated_at,
    l.past_due_at,
    l.cancel_at_period_end,
    l.partner_canceled_at,
    l.last_contacted_at,
    l.claim_last_follow_up_at,
    l.claim_sent_at,
    l.claim_viewed_at,
    l.claim_started_at,
    l.claim_submitted_at,
    l.demo_scheduled_at,
    l.demo_completed_at,
    l.outreach_status,
    l.claim_outreach_status,
    (
      coalesce(l.is_claimed, false)
      or coalesce(l.claimed, false)
      or l.owner_user_id is not null
      or lower(replace(coalesce(l.claim_status, ''), '_', '-')) in ('claimed', 'approved', 'verified')
    ) as is_claimed,
    (
      coalesce(l.is_pro, false)
      or (
        lower(replace(coalesce(l.subscription_status, l.plan_status, ''), '_', '-')) in ('active', 'paid', 'trialing', 'comped')
        and lower(replace(coalesce(l.subscription_plan, l.plan, ''), '_', '-')) not in ('free', 'free-discovery', 'inactive')
      )
      or (
        lower(coalesce(l.subscription_plan, l.plan, '')) ~ '(essential|partner|reserve|pro|paid)'
        and lower(replace(coalesce(l.subscription_status, l.plan_status, ''), '_', '-')) not in ('canceled', 'cancelled', 'inactive')
      )
    ) as is_paid,
    (
      lower(replace(coalesce(l.subscription_status, l.plan_status, ''), '_', '-')) in ('canceled', 'cancelled', 'ended', 'expired')
      or l.partner_canceled_at is not null
    ) as is_canceled
  from public.locations l
  cross join params p
  where l.deleted_at is null
    and (p_permitted_location_ids is null or l.id = any(p_permitted_location_ids))
    and (
      p.q is null
      or (
        coalesce(l.name, '') || ' ' ||
        coalesce(l.business_name, '') || ' ' ||
        coalesce(l.restaurant_name, '') || ' ' ||
        coalesce(l.activity_name, '') || ' ' ||
        coalesce(l.address, '') || ' ' ||
        coalesce(l.city, '') || ' ' ||
        coalesce(l.state, '') || ' ' ||
        coalesce(l.zip_code, '') || ' ' ||
        coalesce(l.phone, '') || ' ' ||
        coalesce(l.owner_email, '') || ' ' ||
        coalesce(l.claimed_by_email, '')
      ) ilike ('%' || p.q || '%')
    )
),
derived as (
  select
    s.*,
    case
      when s.is_canceled
        and coalesce(s.last_contacted_at, s.claim_last_follow_up_at) is not null
        and coalesce(s.last_contacted_at, s.claim_last_follow_up_at) > coalesce(s.partner_canceled_at, s.current_period_end)
        then 'win_back'
      when s.is_canceled and not s.is_paid then 'churned'
      when s.is_paid and (
        s.past_due_at is not null
        or coalesce(s.cancel_at_period_end, false)
        or lower(replace(coalesce(s.subscription_status, s.plan_status, ''), '_', '-')) in ('past-due', 'unpaid', 'incomplete')
        or coalesce(s.churn_risk_score, s.churn_risk, 0) >= 60
        or (coalesce(s.retention_score, 0) > 0 and coalesce(s.retention_score, 0) < 40)
      ) then 'at_risk'
      when s.is_paid
        and coalesce(s.current_period_end, s.next_billing_date) >= now()
        and coalesce(s.current_period_end, s.next_billing_date) < now() + interval '46 days'
        then 'renewal'
      when s.is_paid and s.partner_activated_at is not null then 'active'
      when s.is_paid then 'paid'
      when s.is_claimed then 'claimed'
      when (
        s.claim_started_at is not null
        or s.claim_submitted_at is not null
        or lower(replace(coalesce(s.claim_status, ''), '_', '-')) in ('pending', 'pending-review', 'submitted', 'awaiting-review', 'needs-review')
      ) then 'claim_started'
      when (
        s.claim_viewed_at is not null
        or s.claim_started_at is not null
        or s.claim_submitted_at is not null
        or s.demo_scheduled_at is not null
        or s.demo_completed_at is not null
        or coalesce(s.engagement_score, 0) >= 35
        or coalesce(s.opportunity_score, 0) >= 60
      ) then 'interested'
      when (
        s.claim_sent_at is not null
        or s.last_contacted_at is not null
        or s.claim_last_follow_up_at is not null
        or nullif(btrim(coalesce(s.outreach_status, '')), '') is not null
        or nullif(btrim(coalesce(s.claim_outreach_status, '')), '') is not null
      ) then 'outreach'
      else 'unclaimed'
    end as stage,
    case
      when s.is_canceled and not s.is_paid then 'at_risk'
      when s.is_paid and (
        s.past_due_at is not null
        or coalesce(s.cancel_at_period_end, false)
        or lower(replace(coalesce(s.subscription_status, s.plan_status, ''), '_', '-')) in ('past-due', 'unpaid', 'incomplete')
        or coalesce(s.churn_risk_score, s.churn_risk, 0) >= 60
        or (coalesce(s.retention_score, 0) > 0 and coalesce(s.retention_score, 0) < 40)
      ) then 'at_risk'
      when s.is_canceled
        or s.past_due_at is not null
        or coalesce(s.cancel_at_period_end, false)
        or coalesce(s.churn_risk_score, 0) >= 40
        then 'needs_attention'
      else 'healthy'
    end as health,
    case
      when s.is_canceled and not s.is_paid then 'Canceled'
      when s.is_paid and lower(coalesce(s.subscription_plan, s.plan, '')) like '%essential%' then 'Essentials+'
      when s.is_paid and lower(coalesce(s.subscription_plan, s.plan, '')) like '%reserve%' then 'Reserve'
      when s.is_paid and lower(coalesce(s.subscription_plan, s.plan, '')) like '%partner%' then 'Partner'
      when s.is_paid and lower(coalesce(s.subscription_plan, s.plan, '')) like '%pro%' then 'Paid plan'
      when s.is_paid then coalesce(nullif(s.subscription_plan, ''), nullif(s.plan, ''), 'Paid plan')
      when s.is_claimed then 'Free claimed profile'
      else 'Free listing'
    end as plan_label,
    case
      when not s.is_paid then case when s.is_canceled then 'Ended' else 'Not started' end
      when lower(coalesce(s.subscription_interval, '')) like '%year%' or lower(coalesce(s.subscription_interval, '')) like '%annual%' then 'Annual'
      when lower(coalesce(s.subscription_interval, '')) like '%month%' then 'Monthly'
      else 'Active'
    end as billing_label,
    case
      when coalesce(s.partner_plan_price_cents, 0) > 0
        then case
          when lower(coalesce(s.subscription_interval, '')) like '%year%' or lower(coalesce(s.subscription_interval, '')) like '%annual%'
            then round(s.partner_plan_price_cents / 12.0)::integer
          else s.partner_plan_price_cents
        end
      when s.is_paid then 9900
      else 0
    end as monthly_value_cents,
    case
      when coalesce(s.opportunity_score, 0) >= 80 then 'Strong interest'
      when coalesce(s.opportunity_score, 0) >= 60 then 'Good opportunity'
      when coalesce(s.opportunity_score, 0) >= 40 then 'Worth watching'
      when s.claim_sent_at is not null or s.last_contacted_at is not null or s.claim_last_follow_up_at is not null
        or nullif(btrim(coalesce(s.outreach_status, '')), '') is not null
        or nullif(btrim(coalesce(s.claim_outreach_status, '')), '') is not null
        then 'Early conversation'
      else 'Not contacted'
    end as interest_label
  from signals s
),
filtered as (
  select d.*
  from derived d
  cross join params p
  where (p.stage is null or d.stage = p.stage)
    and (p.health is null or d.health = p.health)
),
aggregate as (
  select
    count(*)::bigint as total,
    count(*) filter (where stage = 'unclaimed')::bigint as unclaimed,
    count(*) filter (where stage in ('outreach','interested','claim_started'))::bigint as in_conversation,
    count(*) filter (where is_claimed)::bigint as claimed,
    count(*) filter (where is_paid)::bigint as paid,
    count(*) filter (where stage = 'renewal')::bigint as renewals,
    count(*) filter (where stage = 'at_risk')::bigint as at_risk,
    count(*) filter (where stage = 'churned')::bigint as churned,
    count(*) filter (where stage = 'win_back')::bigint as win_back,
    coalesce(sum(monthly_value_cents) filter (where is_paid), 0)::bigint as mrr_cents,
    jsonb_build_object(
      'unclaimed', count(*) filter (where stage = 'unclaimed'),
      'outreach', count(*) filter (where stage = 'outreach'),
      'interested', count(*) filter (where stage = 'interested'),
      'claim_started', count(*) filter (where stage = 'claim_started'),
      'claimed', count(*) filter (where stage = 'claimed'),
      'paid', count(*) filter (where stage = 'paid'),
      'active', count(*) filter (where stage = 'active'),
      'renewal', count(*) filter (where stage = 'renewal'),
      'at_risk', count(*) filter (where stage = 'at_risk'),
      'churned', count(*) filter (where stage = 'churned'),
      'win_back', count(*) filter (where stage = 'win_back')
    ) as stage_counts
  from filtered
),
page_rows as (
  select f.*
  from filtered f
  cross join params p
  where p_include_rows
  order by f.updated_at desc nulls last, f.id
  limit (select page_size from params)
  offset ((select page_no - 1 from params) * (select page_size from params))
),
board_ranked as (
  select
    f.*,
    row_number() over (partition by f.stage order by f.updated_at desc nulls last, f.id) as stage_rank
  from filtered f
  where p_include_board
),
board_rows as (
  select *
  from board_ranked
  where stage_rank <= 12
),
page_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'name', display_name,
    'address', address,
    'city', city,
    'state', state,
    'zipCode', zip_code,
    'phone', phone,
    'website', website,
    'ownerEmail', owner_email,
    'stage', stage,
    'health', health,
    'planLabel', plan_label,
    'billingLabel', billing_label,
    'monthlyValueCents', monthly_value_cents,
    'renewalDate', coalesce(current_period_end, next_billing_date),
    'nextAction', next_action,
    'nextActionDueAt', next_action_due_at,
    'claimStatus', coalesce(nullif(claim_status, ''), case when is_claimed then 'Claimed' else 'Unclaimed' end),
    'interestLabel', interest_label,
    'churnRisk', coalesce(churn_risk_score, churn_risk, 0),
    'retentionScore', coalesce(retention_score, 0),
    'activity30d', 0,
    'isPaid', is_paid,
    'isClaimed', is_claimed,
    'subscriptionStatus', subscription_status,
    'stageChangedAt', updated_at,
    'raw', jsonb_build_object('id', id, 'updated_at', updated_at)
  ) order by updated_at desc nulls last, id), '[]'::jsonb) as rows
  from page_rows
),
board_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'name', display_name,
    'address', address,
    'city', city,
    'state', state,
    'zipCode', zip_code,
    'phone', phone,
    'website', website,
    'ownerEmail', owner_email,
    'stage', stage,
    'health', health,
    'planLabel', plan_label,
    'billingLabel', billing_label,
    'monthlyValueCents', monthly_value_cents,
    'renewalDate', coalesce(current_period_end, next_billing_date),
    'nextAction', next_action,
    'nextActionDueAt', next_action_due_at,
    'claimStatus', coalesce(nullif(claim_status, ''), case when is_claimed then 'Claimed' else 'Unclaimed' end),
    'interestLabel', interest_label,
    'churnRisk', coalesce(churn_risk_score, churn_risk, 0),
    'retentionScore', coalesce(retention_score, 0),
    'activity30d', 0,
    'isPaid', is_paid,
    'isClaimed', is_claimed,
    'subscriptionStatus', subscription_status,
    'stageChangedAt', updated_at,
    'raw', jsonb_build_object('id', id, 'updated_at', updated_at)
  ) order by stage, stage_rank), '[]'::jsonb) as rows
  from board_rows
)
select jsonb_build_object(
  'rows', (select rows from page_json),
  'boardRows', (select rows from board_json),
  'total', a.total,
  'page', p.page_no,
  'pageSize', p.page_size,
  'totalPages', greatest(1, ceil(a.total::numeric / p.page_size)::integer),
  'stageCounts', a.stage_counts,
  'totals', jsonb_build_object(
    'total', a.total,
    'unclaimed', a.unclaimed,
    'inConversation', a.in_conversation,
    'claimed', a.claimed,
    'paid', a.paid,
    'renewals', a.renewals,
    'atRisk', a.at_risk,
    'churned', a.churned,
    'winBack', a.win_back,
    'mrrCents', a.mrr_cents
  )
)
from aggregate a
cross join params p;
$$;

revoke all on function public.admin_location_customer_lifecycle_page(text, text, text, integer, integer, uuid[], boolean, boolean) from public;
revoke all on function public.admin_location_customer_lifecycle_page(text, text, text, integer, integer, uuid[], boolean, boolean) from anon;
revoke all on function public.admin_location_customer_lifecycle_page(text, text, text, integer, integer, uuid[], boolean, boolean) from authenticated;
grant execute on function public.admin_location_customer_lifecycle_page(text, text, text, integer, integer, uuid[], boolean, boolean) to service_role;
