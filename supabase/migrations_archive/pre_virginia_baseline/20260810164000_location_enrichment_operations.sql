-- Upgrade the existing catalog enrichment workflow with bounded target sizes,
-- market/type/gap filters, durable outcome counters, and an explicit cursor.

alter table public.location_enrichment_runs
  add column if not exists enriched_records integer not null default 0,
  add column if not exists unchanged_records integer not null default 0,
  add column if not exists skipped_records integer not null default 0,
  add column if not exists profiles_queued_records integer not null default 0,
  add column if not exists photos_cached_records integer not null default 0,
  add column if not exists cursor_location_id uuid null;

create or replace function public.prepare_location_enrichment_run(p_run_id uuid)
returns public.location_enrichment_runs
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run public.location_enrichment_runs;
  v_cutoff timestamptz;
  v_records integer;
  v_calls integer;
  v_market text;
  v_source_type text;
  v_target_limit integer;
  v_gaps text[];
  v_has_gap_filter boolean;
begin
  select * into v_run
  from public.location_enrichment_runs
  where id = p_run_id
  for update;

  if v_run.id is null then
    raise exception 'Enrichment run not found';
  end if;
  if v_run.status not in ('planned', 'paused') then
    raise exception 'Run cannot be prepared from status %', v_run.status;
  end if;

  v_cutoff := now() - make_interval(days => v_run.stale_days);
  v_market := nullif(upper(trim(coalesce(v_run.settings ->> 'market', ''))), 'ALL');
  v_source_type := lower(coalesce(nullif(trim(v_run.settings ->> 'sourceType'), ''), 'both'));
  v_target_limit := greatest(1, least(coalesce(nullif(v_run.settings ->> 'targetLimit', '')::integer, 100), 250));

  select coalesce(array_agg(value), array[]::text[])
    into v_gaps
  from jsonb_array_elements_text(coalesce(v_run.settings -> 'gaps', '[]'::jsonb));
  v_has_gap_filter := coalesce(array_length(v_gaps, 1), 0) > 0;

  delete from public.location_enrichment_run_items
  where run_id = p_run_id
    and status = 'pending';

  with eligible as (
    select
      l.id,
      l.google_place_id,
      l.operating_hours,
      l.main_image,
      l.image_url,
      l.images,
      array_remove(array[
        case when l.google_place_id is null then 'missing_google_place_id' end,
        case when l.operating_hours is null or l.operating_hours in ('{}'::jsonb, '[]'::jsonb) then 'missing_hours' end,
        case when coalesce(nullif(trim(l.main_image), ''), nullif(trim(l.image_url), '')) is null and coalesce(cardinality(l.images), 0) = 0 then 'missing_photos' end,
        case when coalesce(nullif(trim(l.website), ''), nullif(trim(l.google_website_uri), '')) is null then 'missing_website' end,
        case when nullif(trim(l.phone), '') is null then 'missing_phone' end,
        case when (
          (coalesce(lower(l.location_type), '') = 'restaurant' and coalesce(nullif(trim(l.primary_category), ''), nullif(trim(l.cuisine), ''), nullif(trim(l.cuisine_type), '')) is null)
          or
          (coalesce(lower(l.location_type), '') <> 'restaurant' and coalesce(nullif(trim(l.primary_category), ''), nullif(trim(l.activity_type), '')) is null)
        ) then 'missing_category' end,
        case when coalesce(nullif(trim(l.external_reservation_url), ''), nullif(trim(l.reservation_url), ''), nullif(trim(l.reservation_link), ''), nullif(trim(l.booking_url), '')) is null then 'missing_reservation' end,
        case when l.latitude is null or l.longitude is null then 'missing_coordinates' end,
        case when l.search_keywords is null or cardinality(l.search_keywords) = 0 or l.semantic_tags is null or cardinality(l.semantic_tags) = 0 or l.intent_tags is null or cardinality(l.intent_tags) = 0 then 'weak_search_metadata' end,
        case when l.google_enriched_at is null then 'never_enriched' when l.google_enriched_at < v_cutoff then 'stale_google_enrichment' end
      ], null) as reasons
    from public.locations l
    where
      (v_market is null or upper(coalesce(l.market, '')) = v_market)
      and (
        v_source_type = 'both'
        or (v_source_type = 'restaurants' and coalesce(lower(l.location_type), '') = 'restaurant')
        or (v_source_type = 'activities' and coalesce(lower(l.location_type), '') <> 'restaurant')
      )
  ),
  targeted as (
    select
      e.*,
      case
        when 'missing_google_place_id' = any(e.reasons) then 10
        when 'missing_coordinates' = any(e.reasons) then 20
        when 'missing_category' = any(e.reasons) then 30
        when 'missing_hours' = any(e.reasons) or 'missing_photos' = any(e.reasons) then 40
        when 'missing_website' = any(e.reasons) or 'missing_phone' = any(e.reasons) or 'missing_reservation' = any(e.reasons) then 50
        when 'weak_search_metadata' = any(e.reasons) then 60
        else 70
      end as priority
    from eligible e
    where
      v_run.mode = 'full_refresh'
      or (
        not v_has_gap_filter
        and coalesce(array_length(e.reasons, 1), 0) > 0
      )
      or (
        v_has_gap_filter
        and exists (
          select 1
          from unnest(v_gaps) selected_gap
          where selected_gap = any(e.reasons)
        )
      )
    order by priority asc, e.id asc
    limit v_target_limit
  )
  insert into public.location_enrichment_run_items(run_id, location_id, priority, reasons)
  select p_run_id, t.id, t.priority, t.reasons
  from targeted t
  on conflict (run_id, location_id) do nothing;

  select
    count(*),
    coalesce(sum(
      case when l.google_place_id is null then 2 else 1 end
      + case
          when (
            (not v_has_gap_filter or 'missing_photos' = any(v_gaps))
            and coalesce(nullif(trim(l.main_image), ''), nullif(trim(l.image_url), '')) is null
            and coalesce(cardinality(l.images), 0) = 0
          ) then 2
          else 0
        end
    ), 0)
  into v_records, v_calls
  from public.location_enrichment_run_items i
  join public.locations l on l.id = i.location_id
  where i.run_id = p_run_id;

  update public.location_enrichment_runs
  set estimated_records = v_records,
      estimated_api_calls = v_calls,
      processed_records = 0,
      matched_records = 0,
      review_records = 0,
      no_match_records = 0,
      failed_records = 0,
      enriched_records = 0,
      unchanged_records = 0,
      skipped_records = 0,
      profiles_queued_records = 0,
      photos_cached_records = 0,
      actual_api_calls = 0,
      batches_completed = 0,
      cursor_location_id = null,
      last_batch = '{}'::jsonb,
      last_error = null,
      updated_at = now()
  where id = p_run_id
  returning * into v_run;

  insert into public.location_enrichment_run_events(run_id, event_type, message, metadata)
  values (
    p_run_id,
    'prepared',
    'Targeted location enrichment plan prepared',
    jsonb_build_object(
      'records', v_records,
      'estimated_api_calls', v_calls,
      'market', coalesce(v_market, 'ALL'),
      'sourceType', v_source_type,
      'targetLimit', v_target_limit,
      'gaps', to_jsonb(v_gaps)
    )
  );

  return v_run;
end
$function$;

-- These SECURITY DEFINER functions are server-only operational primitives.
revoke all on function public.prepare_location_enrichment_run(uuid) from public, anon, authenticated;
revoke all on function public.claim_location_enrichment_items(uuid, integer) from public, anon, authenticated;
grant execute on function public.prepare_location_enrichment_run(uuid) to service_role;
grant execute on function public.claim_location_enrichment_items(uuid, integer) to service_role;
