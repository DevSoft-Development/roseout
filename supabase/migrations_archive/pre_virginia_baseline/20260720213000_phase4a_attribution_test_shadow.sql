begin;

alter table public.location_analytics_events
  add column if not exists search_id text,
  add column if not exists event_id text,
  add column if not exists result_position integer,
  add column if not exists result_type text,
  add column if not exists traffic_type text not null default 'production',
  add column if not exists is_test_event boolean not null default false,
  add column if not exists test_run_id text;

create unique index if not exists location_analytics_events_event_id_uidx
  on public.location_analytics_events(event_id);
create index if not exists location_analytics_events_search_location_idx
  on public.location_analytics_events(search_id, location_id, created_at desc);
create index if not exists location_analytics_events_test_filter_idx
  on public.location_analytics_events(is_test_event, traffic_type, created_at desc);

-- Preserve multiple feature versions while allowing deterministic upserts.
with ranked as (
  select ctid,
         row_number() over (
           partition by location_id, feature_version
           order by calculated_at desc nulls last, ctid desc
         ) as rn
  from public.search_result_ml_features
)
delete from public.search_result_ml_features f
using ranked r
where f.ctid = r.ctid and r.rn > 1;

create unique index if not exists search_result_ml_features_location_version_uidx
  on public.search_result_ml_features(location_id, feature_version);

create or replace function public.set_search_result_ml_feature_result_key()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.result_key is null or btrim(new.result_key) = '' then
    if new.location_id is null then
      raise exception 'search_result_ml_features requires result_key or location_id';
    end if;
    new.result_key := 'location:' || new.location_id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists set_search_result_ml_feature_result_key_before_write
  on public.search_result_ml_features;
create trigger set_search_result_ml_feature_result_key_before_write
before insert or update of result_key, location_id
on public.search_result_ml_features
for each row execute function public.set_search_result_ml_feature_result_key();

create table if not exists public.search_shadow_rankings (
  id uuid primary key default gen_random_uuid(),
  search_id text not null,
  location_id uuid not null references public.locations(id) on delete cascade,
  live_rank integer not null,
  shadow_rank integer not null,
  rank_change integer not null,
  base_score numeric,
  behavioral_score numeric not null default 0,
  shadow_score numeric not null default 0,
  reason jsonb not null default '{}'::jsonb,
  ranking_version text not null default 'behavioral_shadow_v1',
  is_test_search boolean not null default false,
  calculated_at timestamptz not null default now(),
  unique(search_id, location_id, ranking_version)
);

alter table public.search_shadow_rankings enable row level security;
revoke all on public.search_shadow_rankings from anon, authenticated;
create index if not exists search_shadow_rankings_search_idx
  on public.search_shadow_rankings(search_id, shadow_rank);

create or replace function public.recalculate_behavioral_search_features(
  p_window interval default interval '30 days'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer := 0;
begin
  with impression_totals as (
    select i.location_id, count(*)::int as impression_count
    from public.search_result_impressions i
    where i.location_id is not null
      and i.created_at >= now() - p_window
      and coalesce((i.metadata->>'is_test_event')::boolean, false) = false
    group by i.location_id
  ),
  matched_events as (
    select distinct on (
      e.event_id,
      e.location_id,
      coalesce(e.search_id, ''),
      coalesce(e.user_id::text, e.session_id, 'anonymous'),
      coalesce(e.event_name, e.event_type),
      date_trunc('minute', e.created_at)
    )
      e.location_id,
      case
        when e.event_name in ('location_clicked','result_clicked')
          or e.event_type = 'search_click'
          or e.metadata->>'location_event_type' = 'click' then 'click'
        when e.event_name in ('location_saved','result_saved')
          or e.metadata->>'location_event_type' = 'save' then 'save'
        when e.event_name = 'reservation_completed'
          or e.event_type = 'reservation_completed'
          or e.metadata->>'location_event_type' = 'booking' then 'reservation_complete'
        when e.event_name in ('phone_clicked','call_clicked')
          or e.event_type = 'phone_click' then 'call'
        when e.event_name = 'website_clicked'
          or e.event_type = 'website_click' then 'website_click'
        when e.event_name = 'outing_completed' then 'outing_complete'
        when e.event_name = 'immediate_research' then 'immediate_research'
        else null
      end as action_type
    from public.location_analytics_events e
    join public.search_result_impressions i
      on i.search_id = e.search_id
     and i.location_id = e.location_id
     and e.created_at >= i.created_at
     and e.created_at <= i.created_at + interval '30 days'
    where e.location_id is not null
      and e.search_id is not null
      and e.created_at >= now() - p_window
      and coalesce(e.is_test_event, false) = false
      and coalesce(e.traffic_type, 'production') = 'production'
    order by e.event_id, e.location_id, coalesce(e.search_id, ''),
      coalesce(e.user_id::text, e.session_id, 'anonymous'),
      coalesce(e.event_name, e.event_type), date_trunc('minute', e.created_at), e.created_at
  ),
  event_totals as (
    select location_id,
      count(*) filter (where action_type = 'click')::int as click_count,
      count(*) filter (where action_type = 'save')::int as save_count,
      count(*) filter (where action_type = 'reservation_complete')::int as reservation_complete_count,
      count(*) filter (where action_type = 'call')::int as call_count,
      count(*) filter (where action_type = 'website_click')::int as website_click_count,
      count(*) filter (where action_type = 'outing_complete')::int as outing_complete_count,
      count(*) filter (where action_type = 'immediate_research')::int as immediate_research_count
    from matched_events
    where action_type is not null
    group by location_id
  ),
  negative_totals as (
    select location_id, count(*)::int as negative_feedback_count
    from public.search_negative_feedback
    where location_id is not null and created_at >= now() - p_window
    group by location_id
  ),
  features as (
    select i.location_id, i.impression_count,
      least(i.impression_count, coalesce(e.click_count,0)) as click_count,
      least(i.impression_count, coalesce(e.save_count,0)) as save_count,
      coalesce(e.reservation_complete_count,0) as reservation_complete_count,
      coalesce(e.call_count,0) as call_count,
      coalesce(e.website_click_count,0) as website_click_count,
      coalesce(e.outing_complete_count,0) as outing_complete_count,
      coalesce(e.immediate_research_count,0) as immediate_research_count,
      coalesce(n.negative_feedback_count,0) as negative_feedback_count
    from impression_totals i
    left join event_totals e on e.location_id = i.location_id
    left join negative_totals n on n.location_id = i.location_id
  )
  insert into public.search_result_ml_features (
    result_key, location_id, feature_window, impression_count, seen_impression_count,
    click_count, save_count, reservation_complete_count, call_count, website_click_count,
    outing_complete_count, negative_feedback_count, immediate_research_count,
    seen_ctr, save_rate, conversion_rate, completion_rate, negative_feedback_rate,
    sample_size, confidence_score, calculated_at, data_window_start, data_window_end,
    feature_version, status, result_quality_score
  )
  select
    'location:' || f.location_id::text, f.location_id, '30d', f.impression_count, f.impression_count,
    f.click_count, f.save_count, f.reservation_complete_count, f.call_count, f.website_click_count,
    f.outing_complete_count, f.negative_feedback_count, f.immediate_research_count,
    f.click_count::numeric / nullif(f.impression_count,0),
    f.save_count::numeric / nullif(f.impression_count,0),
    (f.reservation_complete_count + f.call_count + f.website_click_count)::numeric / nullif(f.impression_count,0),
    f.outing_complete_count::numeric / nullif(f.impression_count,0),
    f.negative_feedback_count::numeric / nullif(f.impression_count,0),
    f.impression_count, least(1, ln(1 + f.impression_count) / ln(101)),
    now(), now() - p_window, now(), 'behavioral_phase2_v1',
    case when f.impression_count < 25 then 'low_sample' else 'ready' end,
    greatest(0, least(100,
      50 + (f.click_count::numeric / nullif(f.impression_count,0)) * 20
         + (f.save_count::numeric / nullif(f.impression_count,0)) * 25
         + (f.outing_complete_count::numeric / nullif(f.impression_count,0)) * 35
         - (f.negative_feedback_count::numeric / nullif(f.impression_count,0)) * 35
    ))
  from features f
  on conflict (location_id, feature_version) do update set
    result_key = excluded.result_key,
    impression_count = excluded.impression_count,
    seen_impression_count = excluded.seen_impression_count,
    click_count = excluded.click_count,
    save_count = excluded.save_count,
    reservation_complete_count = excluded.reservation_complete_count,
    call_count = excluded.call_count,
    website_click_count = excluded.website_click_count,
    outing_complete_count = excluded.outing_complete_count,
    negative_feedback_count = excluded.negative_feedback_count,
    immediate_research_count = excluded.immediate_research_count,
    seen_ctr = excluded.seen_ctr,
    save_rate = excluded.save_rate,
    conversion_rate = excluded.conversion_rate,
    completion_rate = excluded.completion_rate,
    negative_feedback_rate = excluded.negative_feedback_rate,
    sample_size = excluded.sample_size,
    confidence_score = excluded.confidence_score,
    calculated_at = excluded.calculated_at,
    data_window_start = excluded.data_window_start,
    data_window_end = excluded.data_window_end,
    status = excluded.status,
    result_quality_score = excluded.result_quality_score;

  get diagnostics updated_count = row_count;
  return jsonb_build_object(
    'ok', true,
    'records_updated', updated_count,
    'event_source', 'attributed_location_analytics_events',
    'test_events_excluded', true,
    'live_reranking_applied', false
  );
end;
$$;

create or replace function public.refresh_behavioral_shadow_rankings(
  p_window interval default interval '30 days'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare inserted_count integer := 0;
begin
  insert into public.search_shadow_rankings (
    search_id, location_id, live_rank, shadow_rank, rank_change,
    base_score, behavioral_score, shadow_score, reason, is_test_search
  )
  select ranked.search_id, ranked.location_id, ranked.live_rank, ranked.shadow_rank,
    ranked.live_rank - ranked.shadow_rank, ranked.base_score, ranked.behavioral_score,
    ranked.shadow_score,
    jsonb_build_object('feature_version','behavioral_phase2_v1','mode','shadow_only'),
    ranked.is_test_search
  from (
    select i.search_id, i.location_id, i.result_position as live_rank,
      row_number() over (
        partition by i.search_id
        order by (coalesce(i.final_score,0) + coalesce(f.result_quality_score,50) * 0.01) desc,
                 i.result_position asc
      )::int as shadow_rank,
      i.final_score as base_score,
      coalesce(f.result_quality_score,50) as behavioral_score,
      coalesce(i.final_score,0) + coalesce(f.result_quality_score,50) * 0.01 as shadow_score,
      coalesce((i.metadata->>'is_test_event')::boolean,false) as is_test_search
    from public.search_result_impressions i
    left join public.search_result_ml_features f
      on f.location_id = i.location_id and f.feature_version = 'behavioral_phase2_v1'
    where i.created_at >= now() - p_window
      and i.location_id is not null
  ) ranked
  on conflict (search_id, location_id, ranking_version) do update set
    live_rank = excluded.live_rank,
    shadow_rank = excluded.shadow_rank,
    rank_change = excluded.rank_change,
    base_score = excluded.base_score,
    behavioral_score = excluded.behavioral_score,
    shadow_score = excluded.shadow_score,
    reason = excluded.reason,
    is_test_search = excluded.is_test_search,
    calculated_at = now();
  get diagnostics inserted_count = row_count;
  return jsonb_build_object('ok',true,'records_updated',inserted_count,'mode','shadow_only');
end;
$$;

create or replace view public.search_behavioral_health_v1
with (security_invoker = true)
as
select
  count(*) filter (where e.created_at >= now() - interval '30 days') as total_interactions_30d,
  count(*) filter (where e.search_id is not null and e.created_at >= now() - interval '30 days') as attributed_interactions_30d,
  count(*) filter (where e.search_id is null and e.created_at >= now() - interval '30 days') as unmatched_interactions_30d,
  count(*) filter (where e.is_test_event and e.created_at >= now() - interval '30 days') as test_interactions_30d,
  count(*) filter (where not e.is_test_event and e.created_at >= now() - interval '30 days') as production_interactions_30d,
  count(*) filter (where e.event_id is null and e.created_at >= now() - interval '30 days') as missing_event_ids_30d,
  (select count(*) from public.search_result_ml_features where feature_version = 'behavioral_phase2_v1' and status = 'ready') as ready_locations,
  (select max(calculated_at) from public.search_result_ml_features where feature_version = 'behavioral_phase2_v1') as last_feature_refresh,
  (select max(calculated_at) from public.search_shadow_rankings) as last_shadow_refresh
from public.location_analytics_events e;

revoke all on public.search_behavioral_health_v1 from anon, authenticated;

commit;
