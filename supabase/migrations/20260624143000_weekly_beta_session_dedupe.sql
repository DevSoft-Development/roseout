-- Repair beta weekly program: one guided weekly session per tester and no duplicate active/draft templates.

create table if not exists public.beta_test_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  tester_id uuid references public.beta_testers(id) on delete set null,
  week_number int not null check (week_number between 1 and 4),
  week_start_date date,
  week_end_date date,
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed')),
  completed_steps int[] not null default '{}',
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

with ranked_sessions as (
  select id,
         row_number() over (
           partition by tester_id, week_start_date
           order by
             case when status = 'completed' then 0 when status = 'in_progress' then 1 else 2 end,
             cardinality(completed_steps) desc,
             updated_at desc nulls last,
             created_at asc nulls last
         ) as rn
  from public.beta_test_sessions
  where tester_id is not null and week_start_date is not null
)
delete from public.beta_test_sessions s
using ranked_sessions r
where s.id = r.id and r.rn > 1;

create unique index if not exists beta_test_sessions_tester_week_start_unique
  on public.beta_test_sessions(tester_id, week_start_date)
  where tester_id is not null and week_start_date is not null;

with ranked as (
  select
    id,
    first_value(id) over (
      partition by lower(trim(title)), tester_type
      order by
        case when status = 'active' then 0 else 1 end,
        created_at asc nulls last,
        id asc
    ) as canonical_id,
    row_number() over (
      partition by lower(trim(title)), tester_type
      order by
        case when status = 'active' then 0 else 1 end,
        created_at asc nulls last,
        id asc
    ) as rn
  from public.beta_tasks
  where status in ('active', 'draft')
)
update public.beta_task_assignments a
set task_id = ranked.canonical_id,
    updated_at = now()
from ranked
where a.task_id = ranked.id
  and ranked.rn > 1
  and coalesce(a.status, '') not in ('completed', 'reviewed');

with ranked as (
  select
    id,
    first_value(id) over (
      partition by lower(trim(title)), tester_type
      order by
        case when status = 'active' then 0 else 1 end,
        created_at asc nulls last,
        id asc
    ) as canonical_id,
    row_number() over (
      partition by lower(trim(title)), tester_type
      order by
        case when status = 'active' then 0 else 1 end,
        created_at asc nulls last,
        id asc
    ) as rn
  from public.beta_tasks
  where status in ('active', 'draft')
)
update public.beta_tasks t
set status = 'archived',
    title = t.title || ' (archived duplicate ' || left(t.id::text, 8) || ')',
    updated_at = now()
from ranked
where t.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists beta_tasks_unique_active_draft_title_tester_type
  on public.beta_tasks (lower(trim(title)), tester_type)
  where status in ('active', 'draft');


create index if not exists beta_sessions_tester_week_start_idx
  on public.beta_test_sessions(tester_id, week_start_date desc);
