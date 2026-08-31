alter table public.search_events
  add column if not exists quality_review_status text not null default 'unreviewed',
  add column if not exists quality_review_notes text,
  add column if not exists quality_reviewed_at timestamptz,
  add column if not exists quality_reviewed_by uuid;

create index if not exists search_events_quality_review_idx
  on public.search_events (quality_review_status, quality_severity, created_at desc);
