create table if not exists public.beta_test_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  tester_id uuid references public.beta_testers(id) on delete set null,
  week_number int not null check (week_number between 1 and 4),
  week_start_date date,
  week_end_date date,
  status text not null default 'in_progress' check (status in ('not_started','in_progress','completed')),
  completed_steps int[] not null default '{}',
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.beta_search_runs (
  id uuid primary key default gen_random_uuid(),
  beta_session_id uuid references public.beta_test_sessions(id) on delete cascade,
  user_id uuid,
  tester_id uuid references public.beta_testers(id) on delete set null,
  beta_assignment_id uuid references public.beta_task_assignments(id) on delete set null,
  week_number int not null check (week_number between 1 and 4),
  outing_sentence text not null,
  enterprise_search_query_used text,
  result_mode text not null check (result_mode in ('single_location','paired_outing')),
  pair_requested boolean not null default false,
  refinement_choices text[] not null default '{}',
  refinement_text text,
  updated_enterprise_search_query text,
  preferred_result_set text check (preferred_result_set is null or preferred_result_set in ('original','updated','about_the_same','neither')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.beta_search_results (
  id uuid primary key default gen_random_uuid(),
  beta_search_run_id uuid references public.beta_search_runs(id) on delete cascade,
  result_type text not null check (result_type in ('single_location','paired_outing','none')),
  location_id uuid,
  pair_id text,
  result_position int,
  result_title text,
  result_data jsonb not null default '{}'::jsonb,
  result_set text not null default 'original' check (result_set in ('original','updated')),
  was_selected boolean not null default false,
  was_saved boolean not null default false,
  was_top_pick boolean not null default false,
  was_chosen_action_result boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.beta_feedback add column if not exists beta_session_id uuid references public.beta_test_sessions(id) on delete set null;
alter table public.beta_feedback add column if not exists beta_search_run_id uuid references public.beta_search_runs(id) on delete set null;
alter table public.beta_feedback add column if not exists week_number int;
alter table public.beta_feedback add column if not exists question_key text;
alter table public.beta_feedback add column if not exists question_text text;
alter table public.beta_feedback add column if not exists answer_value jsonb;
alter table public.beta_feedback add column if not exists answer_text text;
alter table public.beta_feedback add column if not exists answer_options jsonb;
alter table public.beta_feedback add column if not exists result_mode text;
alter table public.beta_feedback add column if not exists selected_none boolean default false;

create index if not exists beta_sessions_tester_week_idx on public.beta_test_sessions(tester_id, week_number, week_start_date desc);
create index if not exists beta_search_runs_session_idx on public.beta_search_runs(beta_session_id, created_at desc);
create index if not exists beta_search_runs_week_mode_idx on public.beta_search_runs(week_number, result_mode, pair_requested);
create index if not exists beta_search_results_run_idx on public.beta_search_results(beta_search_run_id, result_set, result_position);
create index if not exists beta_feedback_guided_idx on public.beta_feedback(beta_session_id, beta_search_run_id, week_number);

alter table public.beta_test_sessions enable row level security;
alter table public.beta_search_runs enable row level security;
alter table public.beta_search_results enable row level security;
