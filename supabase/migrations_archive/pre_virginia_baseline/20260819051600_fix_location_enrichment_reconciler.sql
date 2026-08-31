-- Fix the reconciler aggregation so run counters are rebuilt from item states
-- without an invalid lateral reference to the UPDATE target table.

create or replace function public.reconcile_stale_location_enrichment_runs()
returns void
language plpgsql
set search_path = public
as $$
begin
  update public.location_enrichment_run_items i
  set
    status = 'pending',
    last_error = coalesce(i.last_error, 'Recovered from interrupted enrichment batch; queued for retry.'),
    updated_at = now()
  where i.status = 'processing'
    and i.updated_at < now() - interval '10 minutes'
    and exists (
      select 1
      from public.location_enrichment_runs r
      where r.id = i.run_id
        and r.status = 'running'
    );

  with stats as (
    select
      i.run_id,
      count(*) filter (where i.status in ('completed','unchanged','skipped','failed','review','no_match'))::integer as processed,
      count(*) filter (where i.status = 'review')::integer as review,
      count(*) filter (where i.status = 'no_match')::integer as no_match,
      count(*) filter (where i.status = 'failed')::integer as failed,
      count(*) filter (
        where i.status in ('completed','review')
          and jsonb_typeof(i.match_diagnostics -> 'changedFields') = 'array'
          and jsonb_array_length(i.match_diagnostics -> 'changedFields') > 0
      )::integer as enriched,
      count(*) filter (where i.status = 'unchanged')::integer as unchanged,
      count(*) filter (where i.status in ('skipped','no_match'))::integer as skipped
    from public.location_enrichment_run_items i
    group by i.run_id
  )
  update public.location_enrichment_runs r
  set
    processed_records = stats.processed,
    review_records = stats.review,
    no_match_records = stats.no_match,
    failed_records = stats.failed,
    enriched_records = stats.enriched,
    unchanged_records = stats.unchanged,
    skipped_records = stats.skipped,
    updated_at = now()
  from stats
  where stats.run_id = r.id
    and r.status = 'running';

  update public.location_enrichment_runs r
  set
    status = 'completed',
    completed_at = coalesce(r.completed_at, now()),
    updated_at = now()
  where r.status = 'running'
    and not exists (
      select 1
      from public.location_enrichment_run_items i
      where i.run_id = r.id
        and i.status in ('pending','processing')
    );
end;
$$;

revoke all on function public.reconcile_stale_location_enrichment_runs() from public;
revoke all on function public.reconcile_stale_location_enrichment_runs() from anon;
revoke all on function public.reconcile_stale_location_enrichment_runs() from authenticated;
