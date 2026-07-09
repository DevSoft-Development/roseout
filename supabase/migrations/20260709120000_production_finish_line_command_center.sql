create table if not exists public.production_finish_line_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  item_type text not null,
  week text,
  day text,
  title text not null,
  gate text,
  priority text,
  status text not null default 'not_started',
  owner text,
  notes text,
  test_url text,
  codex_task_url text,
  github_pr_url text,
  last_checked timestamptz,
  sort_order integer not null default 0,
  reviewed_at timestamptz
);
create table if not exists public.production_access_tests (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), role_name text not null, area_name text not null, expected_behavior text, actual_behavior text, status text not null default 'not_started', notes text, codex_task_url text, github_pr_url text, sort_order integer not null default 0, unique(role_name, area_name)
);
create table if not exists public.production_qr_claim_pilot (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), pilot_number integer not null unique, location_id text, location_name text, address text, claim_code text, claim_url text, qr_verified boolean not null default false, postcard_printed boolean not null default false, mailed boolean not null default false, scanned boolean not null default false, claim_started boolean not null default false, claim_submitted boolean not null default false, claim_approved boolean not null default false, owner_dashboard_works boolean not null default false, status text not null default 'not_started', notes text, codex_task_url text, github_pr_url text
);
create table if not exists public.production_command_results (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), command text not null unique, last_run_date timestamptz, result text not null default 'not_run', runner text, notes text, codex_task_url text, github_pr_url text, sort_order integer not null default 0
);
create table if not exists public.production_search_readiness_prompts (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_by uuid references auth.users(id), prompt text not null unique, expected_result text, actual_result text, status text not null default 'not_started', issue_type text, notes text, codex_task_url text, github_pr_url text, sort_order integer not null default 0
);
create or replace function public.set_production_finish_line_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
do $$ begin
  create trigger production_finish_line_items_updated_at before update on public.production_finish_line_items for each row execute function public.set_production_finish_line_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin create trigger production_access_tests_updated_at before update on public.production_access_tests for each row execute function public.set_production_finish_line_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger production_qr_claim_pilot_updated_at before update on public.production_qr_claim_pilot for each row execute function public.set_production_finish_line_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger production_command_results_updated_at before update on public.production_command_results for each row execute function public.set_production_finish_line_updated_at(); exception when duplicate_object then null; end $$;
do $$ begin create trigger production_search_readiness_prompts_updated_at before update on public.production_search_readiness_prompts for each row execute function public.set_production_finish_line_updated_at(); exception when duplicate_object then null; end $$;
alter table public.production_finish_line_items enable row level security;
alter table public.production_access_tests enable row level security;
alter table public.production_qr_claim_pilot enable row level security;
alter table public.production_command_results enable row level security;
alter table public.production_search_readiness_prompts enable row level security;
