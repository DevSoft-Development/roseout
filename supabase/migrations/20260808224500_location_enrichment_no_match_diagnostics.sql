begin;

alter table public.location_enrichment_run_items
  add column if not exists match_diagnostics jsonb not null default '{}'::jsonb;

create index if not exists location_enrichment_run_items_match_rejection_idx
  on public.location_enrichment_run_items ((match_diagnostics ->> 'rejectionReason'))
  where status = 'no_match';

comment on column public.location_enrichment_run_items.match_diagnostics is
  'Structured Google match diagnostics for rejected candidates, including confidence, thresholds, evidence, and the best candidate.';

commit;
