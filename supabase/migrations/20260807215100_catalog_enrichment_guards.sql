begin;

create unique index if not exists location_enrichment_runs_single_active_idx
  on public.location_enrichment_runs ((1))
  where status in ('planned','queued','running','paused','budget_stopped');

grant all on public.location_enrichment_runs to service_role;
grant all on public.location_enrichment_run_items to service_role;
grant all on public.location_enrichment_run_events to service_role;
grant execute on function public.prepare_location_enrichment_run(uuid) to service_role;
grant execute on function public.claim_location_enrichment_items(uuid,integer) to service_role;

commit;
