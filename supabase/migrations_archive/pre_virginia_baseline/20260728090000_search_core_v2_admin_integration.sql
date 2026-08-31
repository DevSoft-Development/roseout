-- Additive Search Core V2 operations metadata. Candidate payloads remain in existing trace/debug storage.
alter table public.search_events add column if not exists search_core_version text;
alter table public.search_events add column if not exists search_plan_version text;
alter table public.search_events add column if not exists public_contract_version text;
alter table public.search_events add column if not exists rollout_percentage integer;
alter table public.search_events add column if not exists rollout_bucket integer;
alter table public.search_events add column if not exists rollout_key_type text;
alter table public.search_events add column if not exists comparison_mode boolean not null default false;
alter table public.search_events add column if not exists search_lab_request boolean not null default false;
alter table public.search_events add column if not exists v2_issue_codes text[];
alter table public.search_events add column if not exists v2_fallback_outcome text;
create index if not exists idx_search_events_core_created on public.search_events(search_core_version,created_at desc);
create index if not exists idx_search_events_v2_issues on public.search_events using gin(v2_issue_codes);
create table if not exists public.search_core_v2_qa_runs(id uuid primary key default gen_random_uuid(),status text not null,branch text,commit_sha text,environment text,search_plan_version text,contract_version text,model_version text,total_tests integer not null default 0,passed integer not null default 0,failed integer not null default 0,warnings integer not null default 0,skipped integer not null default 0,duration_ms integer,p95_ms integer,created_by uuid,started_at timestamptz not null default now(),finished_at timestamptz);
create unique index if not exists idx_v2_qa_one_running_full on public.search_core_v2_qa_runs((status)) where status='running';
create table if not exists public.search_core_v2_qa_cases(id uuid primary key default gen_random_uuid(),run_id uuid not null references public.search_core_v2_qa_runs(id) on delete cascade,case_key text not null,query text not null,status text not null,summary jsonb not null default '{}'::jsonb,trace_request_id text,duration_ms integer,unique(run_id,case_key));
create index if not exists idx_v2_qa_cases_run on public.search_core_v2_qa_cases(run_id);
alter table public.search_core_v2_qa_runs enable row level security;
alter table public.search_core_v2_qa_cases enable row level security;
