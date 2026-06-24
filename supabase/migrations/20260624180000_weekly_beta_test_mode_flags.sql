alter table public.beta_test_sessions add column if not exists test_mode boolean not null default false;
alter table public.beta_search_runs add column if not exists test_mode boolean not null default false;
alter table public.beta_search_results add column if not exists test_mode boolean not null default false;
alter table public.beta_feedback add column if not exists test_mode boolean not null default false;

insert into public.feature_flags (key, name, description, category, enabled, environment, rollout_percentage, metadata)
values
  ('weekly_beta_enabled', 'Run real weekly beta task', 'Controls whether active beta testers can receive and complete the real weekly 5-step beta task.', 'beta', false, 'production', 0, '{}'::jsonb),
  ('weekly_beta_e2e_test_mode_enabled', 'End-to-end weekly beta test mode', 'Allows admins to run test-mode weekly beta sessions excluded from real progress and giveaway eligibility.', 'beta', false, 'production', 0, '{}'::jsonb)
on conflict (key) do nothing;

drop index if exists beta_test_sessions_tester_week_start_unique;
create unique index if not exists beta_test_sessions_real_tester_week_start_unique
  on public.beta_test_sessions(tester_id, week_start_date)
  where tester_id is not null and week_start_date is not null and test_mode = false;
create unique index if not exists beta_test_sessions_test_user_week_start_unique
  on public.beta_test_sessions(user_id, week_start_date)
  where user_id is not null and week_start_date is not null and test_mode = true;
create index if not exists beta_test_sessions_test_mode_idx on public.beta_test_sessions(test_mode, week_start_date desc, status);
