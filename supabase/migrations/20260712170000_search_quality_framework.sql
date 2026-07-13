alter table public.search_events
  add column if not exists technical_success boolean,
  add column if not exists quality_success boolean,
  add column if not exists quality_severity text,
  add column if not exists quality_issue_type text,
  add column if not exists quality_issue_label text,
  add column if not exists suspicious_flags jsonb not null default '[]'::jsonb,
  add column if not exists quality_findings jsonb not null default '[]'::jsonb,
  add column if not exists quality_metrics jsonb not null default '{}'::jsonb,
  add column if not exists quality_evaluated_at timestamptz;
