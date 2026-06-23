alter table public.beta_tasks
  add column if not exists week_start date,
  add column if not exists email_summary text,
  add column if not exists approved_by uuid null,
  add column if not exists approved_at timestamptz null,
  add column if not exists sort_order integer default 0,
  add column if not exists is_template boolean default false;

alter table public.beta_tasks
  alter column estimated_minutes set default 10;

create index if not exists beta_tasks_week_status_idx on public.beta_tasks(week_start, status, sort_order);

create unique index if not exists beta_task_assignments_unique_week_task_idx
on public.beta_task_assignments(task_id, tester_id, assigned_week_start)
where task_id is not null and tester_id is not null and assigned_week_start is not null;
