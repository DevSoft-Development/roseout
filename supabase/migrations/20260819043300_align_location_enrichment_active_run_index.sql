-- Keep the database's single-active-run invariant aligned with the
-- Location Health API and Edge Function.
--
-- Paused and budget-stopped runs are resumable historical states, but they
-- must not block a new CRM Location Health repair. Only work that can
-- currently execute should occupy the single-active slot.

drop index if exists public.location_enrichment_runs_single_active_idx;

create unique index location_enrichment_runs_single_active_idx
  on public.location_enrichment_runs ((1))
  where status in ('planned', 'queued', 'running');
