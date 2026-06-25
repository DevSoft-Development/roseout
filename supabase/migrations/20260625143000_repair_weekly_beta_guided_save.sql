alter table public.beta_test_sessions add column if not exists test_mode boolean not null default false;
alter table public.beta_search_runs add column if not exists test_mode boolean not null default false;
alter table public.beta_search_results add column if not exists test_mode boolean not null default false;
alter table public.beta_feedback add column if not exists test_mode boolean not null default false;

drop index if exists beta_test_sessions_tester_week_start_unique;

create unique index if not exists beta_test_sessions_real_tester_week_start_unique
  on public.beta_test_sessions(tester_id, week_start_date)
  where tester_id is not null and week_start_date is not null and test_mode = false;

create unique index if not exists beta_test_sessions_test_user_week_start_unique
  on public.beta_test_sessions(user_id, week_start_date)
  where user_id is not null and week_start_date is not null and test_mode = true;

create index if not exists beta_test_sessions_test_mode_idx
  on public.beta_test_sessions(test_mode, week_start_date desc, status);
