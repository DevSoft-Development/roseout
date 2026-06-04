create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

create table if not exists public.beta_applications (
  id uuid primary key default gen_random_uuid(), name text not null, email text not null, phone text, city text, borough text,
  tester_type text not null default 'user' check (tester_type in ('user','location_owner','ambassador','experience_team','admin','superadmin')),
  status text not null default 'new' check (status in ('new','approved','rejected','waitlist','invited','converted')),
  device_type text, testing_interests text[] default '{}', availability text, notes text,
  turnstile_verified boolean default false, turnstile_action text, turnstile_hostname text, reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.beta_testers (
  id uuid primary key default gen_random_uuid(), user_id uuid, application_id uuid references public.beta_applications(id) on delete set null,
  name text, email text not null, phone text, tester_type text not null default 'user' check (tester_type in ('user','location_owner','ambassador','experience_team','admin','superadmin')),
  status text not null default 'active' check (status in ('active','paused','completed','removed')), invite_code text unique, notes text, approved_by uuid,
  approved_at timestamptz default now(), last_active_at timestamptz, weekly_required_tests int default 5, weekly_completed_tests int default 0,
  current_week_start date, testing_cadence text default '5_per_week', created_at timestamptz default now(), updated_at timestamptz default now(), unique(email)
);
create table if not exists public.beta_invites (
  id uuid primary key default gen_random_uuid(), email text not null, invite_code text not null unique,
  tester_type text not null default 'user' check (tester_type in ('user','location_owner','ambassador','experience_team','admin','superadmin')),
  status text not null default 'pending' check (status in ('pending','accepted','expired','revoked')), invited_by uuid, accepted_by uuid, expires_at timestamptz,
  accepted_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.beta_tasks (
  id uuid primary key default gen_random_uuid(), title text not null, description text,
  tester_type text not null default 'user' check (tester_type in ('user','location_owner','ambassador','experience_team','admin','superadmin')),
  feature_area text not null default 'general', priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'active' check (status in ('draft','active','paused','completed','archived')), due_at timestamptz, test_url text,
  button_label text default 'Start Test', estimated_minutes int default 5, instructions text, reminder_enabled boolean default true,
  prompt_mode text default 'predefined' check (prompt_mode in ('predefined','custom','either')), predefined_prompt text, allow_custom_prompt boolean default false,
  custom_prompt_required boolean default false, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.beta_task_assignments (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.beta_tasks(id) on delete cascade, tester_id uuid not null references public.beta_testers(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned','in_progress','completed','skipped')), tester_notes text, assigned_week_start date,
  counts_toward_weekly_goal boolean default true, test_url text, assigned_prompt text, submitted_prompt text,
  prompt_mode text default 'predefined' check (prompt_mode in ('predefined','custom','either')), used_custom_prompt boolean default false,
  reminder_sent_at timestamptz, last_reminder_sent_at timestamptz, reminder_count int default 0, started_at timestamptz, viewed_at timestamptz,
  completed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now()
);
create unique index if not exists beta_task_assignments_task_tester_week_idx on public.beta_task_assignments(task_id, tester_id, assigned_week_start);
create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(), tester_id uuid references public.beta_testers(id) on delete set null, user_id uuid,
  feedback_type text not null default 'general' check (feedback_type in ('bug','confusing','bad_search_results','search_was_slow','missing_photo','wrong_category','reservation_issue','claim_issue','qr_issue','design_feedback','feature_request','general')),
  feature_area text not null default 'general', page_url text, location_id uuid, reservation_id uuid, search_query text, search_log_id uuid, submitted_prompt text,
  expected_result text, actual_result text, result_accuracy_rating int, speed_rating text check (speed_rating is null or speed_rating in ('fast','okay','slow','very_slow','failed')),
  rating int, message text not null, screenshot_url text, browser text, device text, turnstile_verified boolean default false, turnstile_action text,
  turnstile_hostname text, status text not null default 'new' check (status in ('new','reviewing','planned','fixed','rejected','needs_more_info','archived')),
  admin_notes text, reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.beta_bug_reports (
  id uuid primary key default gen_random_uuid(), tester_id uuid references public.beta_testers(id) on delete set null, user_id uuid,
  title text not null, description text, steps_to_reproduce text, expected_result text, actual_result text,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')), feature_area text not null default 'general', page_url text,
  screenshot_url text, browser text, device text, turnstile_verified boolean default false, turnstile_action text, turnstile_hostname text,
  status text not null default 'new' check (status in ('new','confirmed','in_progress','fixed','wont_fix','duplicate','archived')), admin_notes text,
  reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.search_performance_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid, session_id text, source text not null default 'unknown', route text, search_query text not null,
  beta_assignment_id uuid, beta_tester_id uuid, used_custom_prompt boolean default false, parsed_intent jsonb, search_mode text, location_area text,
  started_at timestamptz default now(), completed_at timestamptz, total_ms int, llm_ms int, rpc_ms int, restaurant_rpc_ms int, activity_rpc_ms int,
  ranking_ms int, pairing_ms int, photo_filter_ms int, result_count int default 0, restaurant_count int default 0, activity_count int default 0, pair_count int default 0,
  used_llm boolean default false, used_fallback boolean default false, timed_out boolean default false,
  speed_status text check (speed_status is null or speed_status in ('fast','good','slow','critical','failed','timeout')), success boolean default true,
  error_message text, debug jsonb, created_at timestamptz default now()
);
create table if not exists public.beta_email_reminders (
  id uuid primary key default gen_random_uuid(), tester_id uuid references public.beta_testers(id) on delete cascade, email text not null,
  reminder_type text not null check (reminder_type in ('weekly_tasks','midweek_reminder','daily_incomplete_reminder','friday_final_reminder','completed_weekly_goal')),
  subject text not null, status text not null default 'pending' check (status in ('pending','sent','failed','skipped')), week_start date,
  weekly_required_tests int default 5, weekly_completed_tests int default 0, incomplete_task_count int default 0, task_links jsonb default '[]'::jsonb,
  sent_at timestamptz, error_message text, created_at timestamptz default now()
);
create table if not exists public.turnstile_verification_logs (
  id uuid primary key default gen_random_uuid(), source text not null default 'unknown', action text, hostname text, remote_ip text,
  success boolean not null default false, error_codes text[] default '{}', challenge_ts timestamptz, metadata jsonb default '{}'::jsonb, created_at timestamptz default now()
);

create index if not exists beta_applications_status_created_idx on public.beta_applications(status, created_at desc); create index if not exists beta_applications_email_idx on public.beta_applications(email); create index if not exists beta_applications_turnstile_idx on public.beta_applications(turnstile_verified);
create index if not exists beta_testers_email_idx on public.beta_testers(email); create index if not exists beta_testers_status_type_idx on public.beta_testers(status, tester_type);
create index if not exists beta_invites_code_idx on public.beta_invites(invite_code); create index if not exists beta_invites_email_status_idx on public.beta_invites(email, status);
create index if not exists beta_tasks_status_area_idx on public.beta_tasks(status, feature_area); create index if not exists beta_tasks_prompt_idx on public.beta_tasks(prompt_mode); create index if not exists beta_tasks_custom_idx on public.beta_tasks(allow_custom_prompt);
create index if not exists beta_assignments_tester_status_idx on public.beta_task_assignments(tester_id, status); create index if not exists beta_assignments_tester_week_status_idx on public.beta_task_assignments(tester_id, assigned_week_start, status); create index if not exists beta_assignments_url_idx on public.beta_task_assignments(test_url); create index if not exists beta_assignments_custom_idx on public.beta_task_assignments(used_custom_prompt); create index if not exists beta_assignments_prompt_idx on public.beta_task_assignments(submitted_prompt);
create index if not exists beta_feedback_status_created_idx on public.beta_feedback(status, created_at desc); create index if not exists beta_feedback_area_type_idx on public.beta_feedback(feature_area, feedback_type); create index if not exists beta_feedback_query_idx on public.beta_feedback(search_query); create index if not exists beta_feedback_prompt_idx on public.beta_feedback(submitted_prompt); create index if not exists beta_feedback_speed_idx on public.beta_feedback(speed_rating); create index if not exists beta_feedback_turnstile_idx on public.beta_feedback(turnstile_verified);
create index if not exists beta_bugs_status_severity_idx on public.beta_bug_reports(status, severity); create index if not exists beta_bugs_turnstile_idx on public.beta_bug_reports(turnstile_verified);
create index if not exists search_perf_created_idx on public.search_performance_logs(created_at desc); create index if not exists search_perf_speed_created_idx on public.search_performance_logs(speed_status, created_at desc); create index if not exists search_perf_query_idx on public.search_performance_logs(search_query); create index if not exists search_perf_source_created_idx on public.search_performance_logs(source, created_at desc); create index if not exists search_perf_total_idx on public.search_performance_logs(total_ms desc); create index if not exists search_perf_custom_idx on public.search_performance_logs(used_custom_prompt, created_at desc); create index if not exists search_perf_assignment_idx on public.search_performance_logs(beta_assignment_id); create index if not exists search_perf_tester_idx on public.search_performance_logs(beta_tester_id);
create index if not exists beta_reminders_tester_created_idx on public.beta_email_reminders(tester_id, created_at desc); create index if not exists beta_reminders_status_created_idx on public.beta_email_reminders(status, created_at desc); create index if not exists beta_reminders_type_created_idx on public.beta_email_reminders(reminder_type, created_at desc); create index if not exists beta_reminders_unique_week_idx on public.beta_email_reminders(tester_id, reminder_type, week_start);
create index if not exists turnstile_source_created_idx on public.turnstile_verification_logs(source, created_at desc); create index if not exists turnstile_success_created_idx on public.turnstile_verification_logs(success, created_at desc);

create or replace trigger beta_applications_updated_at before update on public.beta_applications for each row execute function public.set_updated_at();
create or replace trigger beta_testers_updated_at before update on public.beta_testers for each row execute function public.set_updated_at();
create or replace trigger beta_invites_updated_at before update on public.beta_invites for each row execute function public.set_updated_at();
create or replace trigger beta_tasks_updated_at before update on public.beta_tasks for each row execute function public.set_updated_at();
create or replace trigger beta_task_assignments_updated_at before update on public.beta_task_assignments for each row execute function public.set_updated_at();
create or replace trigger beta_feedback_updated_at before update on public.beta_feedback for each row execute function public.set_updated_at();
create or replace trigger beta_bug_reports_updated_at before update on public.beta_bug_reports for each row execute function public.set_updated_at();

alter table public.beta_applications enable row level security; alter table public.beta_testers enable row level security; alter table public.beta_task_assignments enable row level security; alter table public.beta_feedback enable row level security; alter table public.beta_bug_reports enable row level security;
do $$ begin
  create policy "Public can insert beta applications" on public.beta_applications for insert with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated testers can insert feedback" on public.beta_feedback for insert to authenticated with check (auth.uid() = user_id or tester_id in (select id from public.beta_testers where user_id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated testers can insert bug reports" on public.beta_bug_reports for insert to authenticated with check (auth.uid() = user_id or tester_id in (select id from public.beta_testers where user_id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Testers can view own assignments" on public.beta_task_assignments for select to authenticated using (tester_id in (select id from public.beta_testers where user_id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Testers can update own assignments" on public.beta_task_assignments for update to authenticated using (tester_id in (select id from public.beta_testers where user_id = auth.uid())) with check (tester_id in (select id from public.beta_testers where user_id = auth.uid()));
exception when duplicate_object then null; end $$;
-- Admin management uses the service-role client in protected server routes. If project-specific role helper SQL functions are added later, mirror admin RLS policies there.

create or replace view public.admin_beta_overview as
select
  (select count(*) from public.beta_applications) total_applications,
  (select count(*) from public.beta_applications where status='new') new_applications,
  (select count(*) from public.beta_applications where status='approved') approved_applications,
  (select count(*) from public.beta_testers) total_testers,
  (select count(*) from public.beta_testers where status='active') active_testers,
  (select count(*) from public.beta_feedback) total_feedback,
  (select count(*) from public.beta_feedback where status in ('new','reviewing','needs_more_info')) open_feedback,
  (select count(*) from public.beta_feedback where status='fixed') fixed_feedback,
  (select count(*) from public.beta_bug_reports) total_bugs,
  (select count(*) from public.beta_bug_reports where severity='critical') critical_bugs,
  (select count(*) from public.beta_bug_reports where status in ('new','confirmed','in_progress')) open_bugs,
  (select avg(total_ms) from public.search_performance_logs where created_at > now() - interval '24 hours') avg_search_ms_24h,
  (select count(*) from public.search_performance_logs where created_at > now() - interval '24 hours' and speed_status in ('slow','critical')) slow_searches_24h,
  (select count(*) from public.search_performance_logs where created_at > now() - interval '24 hours' and speed_status in ('failed','timeout')) failed_searches_24h,
  (select count(*) from public.search_performance_logs where created_at > now() - interval '24 hours') search_count_24h,
  (select count(*) from public.search_performance_logs where created_at > now() - interval '24 hours' and used_custom_prompt) custom_prompt_searches_24h,
  (select count(*) from public.turnstile_verification_logs where created_at > now() - interval '24 hours' and not success) turnstile_failures_24h,
  (select count(*) from public.beta_email_reminders where created_at > date_trunc('week', now()) and status='sent') reminder_emails_sent_week,
  (select count(*) from public.beta_email_reminders where created_at > date_trunc('week', now()) and status='failed') reminder_emails_failed_week,
  (select count(*) from public.beta_testers where status='active' and weekly_completed_tests < weekly_required_tests) testers_with_incomplete_weekly_tasks,
  (select count(*) from public.beta_testers where status='active' and weekly_completed_tests >= 5) testers_completed_5_of_5;

create or replace view public.admin_beta_search_speed_summary as
select date_trunc('day', created_at)::date day, speed_status, used_custom_prompt, count(*)::int count, avg(total_ms)::int avg_total_ms, max(total_ms) max_total_ms,
percentile_cont(0.5) within group (order by total_ms)::int p50_total_ms, percentile_cont(0.95) within group (order by total_ms)::int p95_total_ms
from public.search_performance_logs where created_at > now() - interval '30 days' group by 1,2,3 order by 1 desc;

create or replace view public.admin_beta_slowest_searches as
select id, created_at, source, route, search_query, beta_assignment_id, beta_tester_id, used_custom_prompt, total_ms, llm_ms, rpc_ms, pairing_ms, photo_filter_ms, result_count, restaurant_count, activity_count, pair_count, speed_status, success, error_message
from public.search_performance_logs where speed_status in ('slow','critical','failed','timeout') order by created_at desc limit 200;

insert into public.beta_tasks (title, feature_area, tester_type, priority, test_url, prompt_mode, predefined_prompt, allow_custom_prompt, custom_prompt_required, button_label, estimated_minutes, instructions, status)
values
('Search quality test','search_quality','user','high','/create?betaTask=search-quality','either','steak dinner with bowling in Astoria',true,false,'Test Search Quality',5,'Search for “steak dinner with bowling in Astoria,” or use your own similar outing prompt. Confirm that results show the right restaurants and activity options near the requested area. Report unrelated results, wrong categories, missing activity results, or anything confusing.','active'),
('Search speed test','search_speed','user','high','/create?betaTask=search-speed','either','casual dinner and relaxed activity',true,false,'Test Search Speed',5,'Search for “casual dinner and relaxed activity,” or enter your own prompt. Check if results load quickly, if the page freezes, or if an error appears. Submit feedback if the search feels slow.','active'),
('Try your own search prompt','natural_search','user','high','/create?betaTask=custom-prompt','custom',null,true,true,'Test My Prompt',5,'Type a real search you would naturally use on TheOutHaven. It can be for a date, birthday, family outing, group outing, dinner, brunch, lounge, spa, activity, walking-distance pairing, or something nearby. After the search, tell us if the results were accurate and fast.','active'),
('Location page and photo test','location_page','user','medium','/locations?betaTask=location-photo-test','predefined',null,false,false,'Test Location Pages',5,'Open 2–3 location pages. Check that photos show correctly, addresses are not duplicated, categories look clean, and the page feels premium.','active'),
('Create plan flow test','create_flow','user','medium','/create?betaTask=create-flow','either','birthday dinner and fun activity in Queens',true,false,'Test Plan Creation',5,'Use the create flow to build a plan. You may use the provided prompt or your own. Check if the steps are easy to understand, if recommendations make sense, and if the page feels smooth on mobile and desktop.','active'),
('Rotating feature test','general','user','medium','/beta/dashboard?betaTask=rotating-feature','predefined',null,false,false,'Start Weekly Feature Test',5,'Complete the feature-specific test assigned to your tester type.','active')
on conflict do nothing;
