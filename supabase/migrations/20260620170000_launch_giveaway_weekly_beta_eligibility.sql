alter table if exists public.launch_waitlist_signups
  add column if not exists giveaway_rules_agreed boolean not null default false,
  add column if not exists weekly_beta_tasks_required_for_giveaway boolean not null default true,
  add column if not exists weekly_task_eligibility_status text null;
