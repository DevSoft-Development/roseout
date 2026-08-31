begin;

-- Canonicalize the location analytics rows used by behavioral search learning.
-- Keep legacy event_type values for existing business dashboards.
create or replace function public.normalize_location_analytics_event_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.event_name := case
    when new.metadata->>'location_event_type' = 'click' then 'location_clicked'
    when new.metadata->>'location_event_type' = 'save' then 'location_saved'
    when new.metadata->>'location_event_type' = 'view' then 'location_viewed'
    when new.metadata->>'location_event_type' = 'booking' then 'reservation_completed'
    when new.metadata->>'location_event_type' = 'skip' then 'location_skipped'
    when new.event_type = 'search_click' then 'location_clicked'
    when new.event_type = 'share_click' then 'location_saved'
    when new.event_type = 'reservation_completed' then 'reservation_completed'
    when new.event_type = 'reservation_started' then 'reservation_started'
    when new.event_type = 'phone_click' then 'phone_clicked'
    when new.event_type = 'website_click' then 'website_clicked'
    else coalesce(nullif(new.event_name, ''), 'unknown')
  end;
  return new;
end;
$$;

drop trigger if exists normalize_location_analytics_event_name_before_write
  on public.location_analytics_events;
create trigger normalize_location_analytics_event_name_before_write
before insert or update of event_type, metadata, event_name
on public.location_analytics_events
for each row
execute function public.normalize_location_analytics_event_name();

-- Backfill existing rows so current interactions are immediately usable.
update public.location_analytics_events
set event_name = case
  when metadata->>'location_event_type' = 'click' then 'location_clicked'
  when metadata->>'location_event_type' = 'save' then 'location_saved'
  when metadata->>'location_event_type' = 'view' then 'location_viewed'
  when metadata->>'location_event_type' = 'booking' then 'reservation_completed'
  when metadata->>'location_event_type' = 'skip' then 'location_skipped'
  when event_type = 'search_click' then 'location_clicked'
  when event_type = 'share_click' then 'location_saved'
  when event_type = 'reservation_completed' then 'reservation_completed'
  when event_type = 'reservation_started' then 'reservation_started'
  when event_type = 'phone_click' then 'phone_clicked'
  when event_type = 'website_click' then 'website_clicked'
  else coalesce(nullif(event_name, ''), 'unknown')
end
where event_name is null
   or event_name = 'unknown'
   or metadata ? 'location_event_type';

create index if not exists location_analytics_events_behavioral_idx
  on public.location_analytics_events(location_id, created_at desc, event_name);

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
    select
      i.location_id,
      count(*)::int as impression_count
    from public.search_result_impressions i
    where i.location_id is not null
      and i.created_at >= now() - p_window
    group by i.location_id
  ),
  normalized_events as (
    select
      e.id,
      e.location_id,
      coalesce(e.user_id::text, e.session_id, 'anonymous') as actor_key,
      case
        when e.event_name in ('location_clicked', 'result_clicked')
          or e.event_type = 'search_click'
          or e.metadata->>'location_event_type' = 'click'
          then 'click'
        when e.event_name in ('location_saved', 'result_saved')
          or e.metadata->>'location_event_type' = 'save'
          then 'save'
        when e.event_name = 'reservation_completed'
          or e.event_type = 'reservation_completed'
          or e.metadata->>'location_event_type' = 'booking'
          then 'reservation_complete'
        when e.event_name in ('phone_clicked', 'call_clicked')
          or e.event_type = 'phone_click'
          then 'call'
        when e.event_name = 'website_clicked'
          or e.event_type = 'website_click'
          then 'website_click'
        when e.event_name = 'outing_completed'
          then 'outing_complete'
        when e.event_name = 'immediate_research'
          then 'immediate_research'
        else null
      end as action_type,
      e.created_at,
      date_trunc('minute', e.created_at) as action_minute
    from public.location_analytics_events e
    where e.location_id is not null
      and e.created_at >= now() - p_window
  ),
  deduped_events as (
    select distinct on (
      location_id,
      actor_key,
      action_type,
      action_minute
    )
      location_id,
      action_type,
      created_at
    from normalized_events
    where action_type is not null
    order by
      location_id,
      actor_key,
      action_type,
      action_minute,
      created_at
  ),
  event_totals as (
    select
      location_id,
      count(*) filter (where action_type = 'click')::int as click_count,
      count(*) filter (where action_type = 'save')::int as save_count,
      count(*) filter (where action_type = 'reservation_complete')::int as reservation_complete_count,
      count(*) filter (where action_type = 'call')::int as call_count,
      count(*) filter (where action_type = 'website_click')::int as website_click_count,
      count(*) filter (where action_type = 'outing_complete')::int as outing_complete_count,
      count(*) filter (where action_type = 'immediate_research')::int as immediate_research_count
    from deduped_events
    group by location_id
  ),
  negative_totals as (
    select
      n.location_id,
      count(*)::int as negative_feedback_count
    from public.search_negative_feedback n
    where n.location_id is not null
      and n.created_at >= now() - p_window
    group by n.location_id
  ),
  features as (
    select
      i.location_id,
      i.impression_count,
      coalesce(e.click_count, 0) as click_count,
      coalesce(e.save_count, 0) as save_count,
      coalesce(e.reservation_complete_count, 0) as reservation_complete_count,
      coalesce(e.call_count, 0) as call_count,
      coalesce(e.website_click_count, 0) as website_click_count,
      coalesce(e.outing_complete_count, 0) as outing_complete_count,
      coalesce(e.immediate_research_count, 0) as immediate_research_count,
      coalesce(n.negative_feedback_count, 0) as negative_feedback_count
    from impression_totals i
    left join event_totals e on e.location_id = i.location_id
    left join negative_totals n on n.location_id = i.location_id
  )
  insert into public.search_result_ml_features (
    location_id,
    feature_window,
    impression_count,
    seen_impression_count,
    click_count,
    save_count,
    reservation_complete_count,
    call_count,
    website_click_count,
    outing_complete_count,
    negative_feedback_count,
    immediate_research_count,
    seen_ctr,
    save_rate,
    conversion_rate,
    completion_rate,
    negative_feedback_rate,
    sample_size,
    confidence_score,
    calculated_at,
    data_window_start,
    data_window_end,
    feature_version,
    status,
    result_quality_score
  )
  select
    f.location_id,
    '30d',
    f.impression_count,
    f.impression_count,
    f.click_count,
    f.save_count,
    f.reservation_complete_count,
    f.call_count,
    f.website_click_count,
    f.outing_complete_count,
    f.negative_feedback_count,
    f.immediate_research_count,
    coalesce(f.click_count::numeric / nullif(f.impression_count, 0), 0),
    coalesce(f.save_count::numeric / nullif(f.impression_count, 0), 0),
    coalesce((f.reservation_complete_count + f.call_count + f.website_click_count)::numeric / nullif(f.impression_count, 0), 0),
    coalesce(f.outing_complete_count::numeric / nullif(f.impression_count, 0), 0),
    coalesce(f.negative_feedback_count::numeric / nullif(f.impression_count, 0), 0),
    f.impression_count,
    least(1, ln(1 + f.impression_count) / ln(101)),
    now(),
    now() - p_window,
    now(),
    'behavioral_phase2_v1',
    case when f.impression_count < 25 then 'low_sample' else 'ready' end,
    greatest(
      0,
      least(
        100,
        50
        + coalesce(f.click_count::numeric / nullif(f.impression_count, 0), 0) * 20
        + coalesce(f.save_count::numeric / nullif(f.impression_count, 0), 0) * 25
        + coalesce(f.outing_complete_count::numeric / nullif(f.impression_count, 0), 0) * 35
        - coalesce(f.negative_feedback_count::numeric / nullif(f.impression_count, 0), 0) * 35
      )
    )
  from features f
  on conflict (location_id) do update set
    feature_window = excluded.feature_window,
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
    feature_version = excluded.feature_version,
    status = excluded.status,
    result_quality_score = excluded.result_quality_score;

  get diagnostics updated_count = row_count;

  insert into public.behavioral_feature_runs (
    run_type,
    status,
    completed_at,
    records_updated,
    feature_version,
    source_window_start,
    source_window_end
  ) values (
    'recalculate_search_result_features',
    'completed',
    now(),
    updated_count,
    'behavioral_phase2_v1',
    now() - p_window,
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'records_updated', updated_count,
    'event_source', 'location_analytics_events',
    'dedupe_window', '1 minute'
  );
end;
$$;

commit;
