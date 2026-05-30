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
  l.id as id,
  l.id as location_id,

  coalesce(l.name, l.restaurant_name, l.activity_name, 'Untitled Location') as name,
  coalesce(l.name, l.restaurant_name, l.activity_name, 'Untitled Location') as location_name,

  l.location_type,
  l.restaurant_name,
  l.activity_name,

  l.address,
  l.city,
  coalesce(l.borough, l.neighborhood, l.city) as borough,
  l.state,
  l.zip_code as zip,
  l.zip_code as zip_code,
  l.neighborhood,
  l.latitude,
  l.longitude,

  l.phone,
  l.website,
  l.google_maps_url,

  l.primary_category AS category,
  l.primary_category,
  coalesce(l.cuisine, l.cuisine_type) as cuisine,
  l.cuisine_type,
  l.activity_type,
  l.atmosphere,
  l.lighting,
  l.noise_level,
  l.price_range,

  l.description,
  l.operating_hours,
  l.special_hours,
  l.holiday_closures,

  coalesce(l.main_image, l.image_url) as main_image,
  coalesce(l.image_url, l.main_image) as image_url,
  coalesce(l.images, array[]::text[]) as gallery_images,
  l.images,

  l.rating,
  l.review_count,
  l.review_score,
  l.review_keywords,
  l.review_snippet,

  l.primary_tag,
  l.tags,
  l.vibe_tags,
  l.best_for,
  l.best_for_tags,
  l.date_style_tags,
  l.search_keywords,
  l.special_features,
  l.signature_items,
  l.google_types,
  l.semantic_tags,
  l.intent_tags,

  l.quality_score,
  l.popularity_score,
  l.roseout_score,
  l.theouthaven_score,
  l.search_score,
  l.trend_score,
  l.conversion_score,
  l.recommendation_score,
  l.analytics_score,

  l.status,
  l.data_status,
  l.missing_fields,
  l.is_searchable,
  l.is_hidden,
  l.is_featured,
  l.is_verified,

  l.reservation_link,
  l.reservation_url,
  l.booking_url,
  l.external_reservation_url,
  coalesce(l.reservation_url, l.reservation_link, l.booking_url, l.external_reservation_url) as best_reservation_url,
  l.reservation_enabled,
  l.uses_internal_reservations,
  l.internal_reservations_enabled,
  l.reservation_source,
  l.reservation_type,
  l.max_party_size,
  l.reservation_interval_minutes,
  l.turn_time_minutes,
  l.booking_cutoff_minutes,
  l.cancellation_policy,
  l.reservation_settings,
  l.reservation_upgrade_opportunity,
  l.reservation_upgrade_reason,
  l.reservation_upgrade_detected_at,
  l.reservation_outreach_status,
  l.reservation_outreach_notes,

  l.is_claimed,
  l.claim_status,
  l.claim_verification_status,
  l.claimed_by,
  l.claimed_by_email,
  l.claimed_at,
  l.owner_user_id,
  l.owner_email,
  l.owner_name,
  l.owner_phone,
  l.claim_token,
  l.claim_code,
  l.claim_url,
  l.claim_qr_url,
  l.qr_link,
  l.qr_code_data_url,

  coalesce(l.plan, l.subscription_plan) as plan,
  coalesce(l.plan_status, l.subscription_status) as plan_status,
  l.subscription_plan,
  l.subscription_status,
  l.current_period_end,
  l.trial_ends_at,
  l.pro_until,
  l.is_pro,
  l.promo_code_used,
  l.deposits_enabled,
  l.default_deposit_amount,
  l.deposit_type,
  l.is_promoted,
  l.promotion_tier,
  l.promotion_starts_at,
  l.promotion_ends_at,
  l.promotion_budget,
  l.stripe_customer_id,
  l.stripe_subscription_id,

  l.crm_status,
  l.opportunity_score,
  l.churn_risk_score,
  l.upgrade_probability,
  l.engagement_score,
  l.traffic_score,
  l.retention_score,
  l.follow_up_date,
  l.outreach_status,
  l.outreach_notes,
  l.last_contacted_at,
  l.retention_recommendation,

  l.source_table,
  l.source_id,
  l.google_place_id,
  l.search_document,
  l.semantic_search_text,
  l.embedding_model,
  l.embedding_updated_at,
  l.needs_semantic_refresh,
  l.last_quality_check_at,
  l.last_ranked_at,

  l.created_at,
  l.updated_at
from public.locations l;

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
