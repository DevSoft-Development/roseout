-- Keep enrichment-run progress truthful after an interrupted worker invocation.
-- A claimed item that remains in `processing` for more than 10 minutes is
-- safe to return to `pending`; the normal runner will claim it again.

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

  update public.location_enrichment_runs r
  set
    processed_records = (
      select count(*)::integer
      from public.location_enrichment_run_items i
      where i.run_id = r.id
        and i.status in ('completed', 'unchanged', 'skipped', 'failed', 'review', 'no_match')
    ),
    updated_at = now()
  where r.status = 'running';

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
        and i.status in ('pending', 'processing')
    );
end;
$$;

revoke all on function public.reconcile_stale_location_enrichment_runs() from public;
revoke all on function public.reconcile_stale_location_enrichment_runs() from anon;
revoke all on function public.reconcile_stale_location_enrichment_runs() from authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'location-enrichment-reconcile';

select cron.schedule(
  'location-enrichment-reconcile',
  '*/5 * * * *',
  $job$select public.reconcile_stale_location_enrichment_runs();$job$
);
