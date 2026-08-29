alter table public.search_health_events
  add column if not exists technical_success boolean,
  add column if not exists quality_success boolean,
  add column if not exists quality_severity text,
  add column if not exists quality_issue_type text,
  add column if not exists quality_issue_label text,
  add column if not exists suspicious_flags jsonb not null default '[]'::jsonb,
  add column if not exists expected_audience text,
  add column if not exists detected_audience text,
  add column if not exists top_result_categories jsonb not null default '[]'::jsonb,
  add column if not exists adult_oriented_top_five_count integer not null default 0,
  add column if not exists relevant_top_five_count integer not null default 0,
  add column if not exists generic_intent_result_count integer not null default 0,
  add column if not exists conflicting_positive_boost_count integer not null default 0,
  add column if not exists quality_evaluated_at timestamptz;

create index if not exists idx_search_health_events_quality_success
  on public.search_health_events(quality_success, created_at desc);
create index if not exists idx_search_health_events_quality_severity
  on public.search_health_events(quality_severity, created_at desc);
create index if not exists idx_search_health_events_quality_issue_type
  on public.search_health_events(quality_issue_type, created_at desc);
