-- Lightweight business CRM foundation.
-- Safe, additive migration.

alter table if exists public.locations
  add column if not exists crm_status text default 'Unclaimed',
  add column if not exists opportunity_score numeric default 0,
  add column if not exists churn_risk_score numeric default 0,
  add column if not exists upgrade_probability numeric default 0,
  add column if not exists engagement_score numeric default 0,
  add column if not exists traffic_score numeric default 0,
  add column if not exists conversion_score numeric default 0,
  add column if not exists retention_score numeric default 0,
  add column if not exists follow_up_date date,
  add column if not exists outreach_status text default 'none',
  add column if not exists outreach_notes text,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists retention_recommendation text;

create table if not exists public.business_crm_reminders (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  title text not null,
  reminder_status text default 'pending',
  follow_up_date date,
  snoozed_until timestamptz,
  completed_at timestamptz,
  owner_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.business_crm_notes (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  note_type text default 'admin_note',
  note_body text not null,
  changed_from text,
  changed_to text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.business_communication_logs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  channel text not null,
  provider text,
  template_key text,
  delivery_status text default 'queued',
  open_count integer default 0,
  click_count integer default 0,
  metadata jsonb default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.business_ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  recommendation_type text not null,
  confidence_score numeric default 0,
  reason text,
  generated_at timestamptz default now(),
  active boolean default true
);

create or replace view public.business_crm_snapshot as
select
  l.id as location_id,
  l.name as location_name,
  l.city,
  coalesce(l.borough, l.city) as borough,
  l.is_claimed,
  l.reservation_url,
  coalesce(l.crm_status, 'Unclaimed') as crm_status,
  coalesce(l.opportunity_score, 0) as opportunity_score,
  coalesce(l.upgrade_probability, 0) as upgrade_probability,
  coalesce(l.engagement_score, 0) as engagement_score,
  coalesce(l.traffic_score, 0) as traffic_score,
  coalesce(l.conversion_score, 0) as conversion_score,
  coalesce(l.retention_score, 0) as retention_score,
  coalesce(l.churn_risk_score, 0) as churn_risk_score,
  greatest(0, least(100,
    coalesce(l.traffic_score, 0) * 0.35 +
    coalesce(l.engagement_score, 0) * 0.2 +
    coalesce(l.conversion_score, 0) * 0.25 +
    coalesce(l.retention_score, 0) * 0.2
  )) as trending_score,
  coalesce(analytics.reservation_completions_30d, 0) as reservation_completions_30d,
  coalesce(analytics.profile_views_30d, 0) as profile_views_30d,
  coalesce(analytics.search_appearances_30d, 0) as search_appearances_30d,
  coalesce(analytics.saves_30d, 0) as saves_30d,
  coalesce(analytics.conversion_rate_30d, 0) as conversion_rate_30d,
  l.id as id,
  l.name as name,
  l.state,
  l.address,
  l.phone,
  l.website,
  l.primary_category as category,
  l.cuisine,
  l.description,
  l.status,
  l.is_searchable,
  l.external_reservation_url,
  l.location_type,
  l.owner_user_id,
  l.follow_up_date,
  l.outreach_status,
  l.last_contacted_at,
  l.created_at,
  l.updated_at
from public.locations l
left join (
  select
    lda.location_id,
    sum(lda.profile_views) as profile_views_30d,
    sum(lda.search_appearances) as search_appearances_30d,
    sum(lda.share_clicks) as saves_30d,
    sum(lda.reservation_completions) as reservation_completions_30d,
    case when sum(lda.profile_views) > 0
      then sum(lda.reservation_completions)::numeric / sum(lda.profile_views)::numeric
      else 0 end as conversion_rate_30d
  from public.location_daily_analytics lda
  where lda.analytics_date >= (current_date - interval '30 days')
  group by lda.location_id
) analytics on analytics.location_id = l.id;

create or replace view public.admin_crm_locations_view as
select
  s.id,
  s.location_id,
  s.name,
  s.location_name,
  s.city,
  s.borough,
  s.state,
  null::text as zip,
  null::text as zip_code,
  s.address,
  s.phone,
  s.website,
  s.category,
  s.cuisine,
  s.description,
  s.status,
  s.is_searchable,
  s.is_claimed,
  s.reservation_url,
  s.external_reservation_url,
  s.location_type,
  s.owner_user_id,
  s.crm_status,
  s.opportunity_score,
  s.upgrade_probability,
  s.engagement_score,
  s.traffic_score,
  s.conversion_score,
  s.retention_score,
  s.churn_risk_score,
  s.trending_score,
  s.reservation_completions_30d,
  s.profile_views_30d,
  s.search_appearances_30d,
  s.saves_30d,
  s.conversion_rate_30d,
  s.follow_up_date,
  s.outreach_status,
  s.last_contacted_at,
  s.created_at,
  s.updated_at
from public.business_crm_snapshot s;

create or replace function public.recalculate_business_crm_scores()
returns void
language plpgsql
security definer
as $$
begin
  update public.locations l
  set
    traffic_score = least(100, coalesce(s.profile_views_30d, 0) / 10.0),
    engagement_score = least(100, (coalesce(s.search_appearances_30d, 0) / 8.0) + (coalesce(s.saves_30d, 0) * 2.5)),
    conversion_score = least(100, coalesce(s.conversion_rate_30d, 0) * 1000),
    retention_score = case when l.is_claimed then 65 else 40 end + least(35, coalesce(s.reservation_completions_30d, 0) / 4.0),
    opportunity_score = greatest(0, least(100,
      coalesce(s.profile_views_30d, 0) / 10.0 * 0.35 +
      ((coalesce(s.search_appearances_30d, 0) / 8.0) + (coalesce(s.saves_30d, 0) * 2.5)) * 0.2 +
      (coalesce(s.conversion_rate_30d, 0) * 1000) * 0.25 +
      ((case when l.is_claimed then 65 else 40 end + least(35, coalesce(s.reservation_completions_30d, 0) / 4.0))) * 0.2
    )),
    upgrade_probability = greatest(0, least(100, coalesce(l.opportunity_score, 0) * 0.85 + case when l.is_claimed then 10 else 0 end)),
    churn_risk_score = greatest(0, least(100, 100 - coalesce(l.retention_score, 0))),
    crm_status = case
      when l.is_claimed and coalesce(l.opportunity_score, 0) >= 75 then 'Upgrade Opportunity'
      when l.is_claimed then 'Active Free'
      when not l.is_claimed then 'Unclaimed'
      else coalesce(l.crm_status, 'Unclaimed')
    end,
    retention_recommendation = case
      when (100 - coalesce(l.retention_score, 0)) >= 65 then 'High churn risk: start retention outreach'
      when coalesce(l.opportunity_score, 0) >= 75 then 'Upsell candidate: prioritize pro outreach'
      else 'Monitor weekly'
    end
  from public.business_crm_snapshot s
  where s.location_id = l.id;
end;
$$;

comment on function public.recalculate_business_crm_scores is 'Run nightly (pg_cron) to refresh business CRM and upgrade scores.';
