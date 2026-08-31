-- Repair TheOutHaven Beta Tester Program uniqueness and assignment upserts.

update public.beta_testers
set email = lower(trim(email))
where email is not null and email <> lower(trim(email));

update public.beta_applications
set email = lower(trim(email))
where email is not null and email <> lower(trim(email));

-- Merge duplicate beta_testers by normalized email before enforcing uniqueness.
-- Keep the row that is most complete: linked user, active/approved status, approved_at,
-- task history, then newest updated/created row.
with ranked as (
  select
    bt.id,
    lower(trim(bt.email)) as normalized_email,
    first_value(bt.id) over (
      partition by lower(trim(bt.email))
      order by
        (bt.user_id is not null) desc,
        (bt.status in ('active','approved')) desc,
        (bt.approved_at is not null) desc,
        (select count(*) from public.beta_task_assignments bta where bta.tester_id = bt.id) desc,
        bt.updated_at desc nulls last,
        bt.created_at desc nulls last,
        bt.id desc
    ) as keep_id
  from public.beta_testers bt
  where bt.email is not null and trim(bt.email) <> ''
), dupes as (
  select id, keep_id from ranked where id <> keep_id
), assignment_moves as (
  select
    a.id as assignment_id,
    a.tester_id as old_tester_id,
    d.keep_id,
    existing.id as existing_assignment_id
  from public.beta_task_assignments a
  join dupes d on d.id = a.tester_id
  left join public.beta_task_assignments existing
    on existing.tester_id = d.keep_id
   and existing.task_id = a.task_id
   and existing.assigned_week_start is not distinct from a.assigned_week_start
)
update public.beta_task_assignments a
set tester_id = m.keep_id
from assignment_moves m
where a.id = m.assignment_id
  and m.existing_assignment_id is null;

with ranked as (
  select
    bt.id,
    first_value(bt.id) over (
      partition by lower(trim(bt.email))
      order by
        (bt.user_id is not null) desc,
        (bt.status in ('active','approved')) desc,
        (bt.approved_at is not null) desc,
        (select count(*) from public.beta_task_assignments bta where bta.tester_id = bt.id) desc,
        bt.updated_at desc nulls last,
        bt.created_at desc nulls last,
        bt.id desc
    ) as keep_id
  from public.beta_testers bt
  where bt.email is not null and trim(bt.email) <> ''
), dupes as (
  select id, keep_id from ranked where id <> keep_id
), assignment_conflicts as (
  select a.id
  from public.beta_task_assignments a
  join dupes d on d.id = a.tester_id
  where exists (
    select 1 from public.beta_task_assignments kept
    where kept.tester_id = d.keep_id
      and kept.task_id = a.task_id
      and kept.assigned_week_start is not distinct from a.assigned_week_start
  )
)
delete from public.beta_task_assignments a
using assignment_conflicts c
where a.id = c.id;

with ranked as (
  select
    bt.*,
    first_value(bt.id) over (
      partition by lower(trim(bt.email))
      order by
        (bt.user_id is not null) desc,
        (bt.status in ('active','approved')) desc,
        (bt.approved_at is not null) desc,
        (select count(*) from public.beta_task_assignments bta where bta.tester_id = bt.id) desc,
        bt.updated_at desc nulls last,
        bt.created_at desc nulls last,
        bt.id desc
    ) as keep_id
  from public.beta_testers bt
  where bt.email is not null and trim(bt.email) <> ''
), merged as (
  select
    keep_id,
    max(user_id) filter (where user_id is not null) as user_id,
    max(application_id) filter (where application_id is not null) as application_id,
    max(name) filter (where name is not null and trim(name) <> '') as name,
    max(phone) filter (where phone is not null and trim(phone) <> '') as phone,
    coalesce(max(status) filter (where status = 'active'), max(status) filter (where status = 'approved'), max(status)) as status,
    min(approved_at) filter (where approved_at is not null) as approved_at,
    max(weekly_required_tests) as weekly_required_tests,
    max(weekly_completed_tests) as weekly_completed_tests
  from ranked
  group by keep_id
)
update public.beta_testers bt
set
  user_id = coalesce(bt.user_id, m.user_id),
  application_id = coalesce(bt.application_id, m.application_id),
  name = coalesce(nullif(bt.name, ''), m.name),
  phone = coalesce(nullif(bt.phone, ''), m.phone),
  status = coalesce(m.status, bt.status),
  approved_at = coalesce(bt.approved_at, m.approved_at),
  weekly_required_tests = greatest(coalesce(bt.weekly_required_tests, 0), coalesce(m.weekly_required_tests, 5)),
  weekly_completed_tests = greatest(coalesce(bt.weekly_completed_tests, 0), coalesce(m.weekly_completed_tests, 0))
from merged m
where bt.id = m.keep_id;

with ranked as (
  select
    bt.id,
    first_value(bt.id) over (
      partition by lower(trim(bt.email))
      order by
        (bt.user_id is not null) desc,
        (bt.status in ('active','approved')) desc,
        (bt.approved_at is not null) desc,
        (select count(*) from public.beta_task_assignments bta where bta.tester_id = bt.id) desc,
        bt.updated_at desc nulls last,
        bt.created_at desc nulls last,
        bt.id desc
    ) as keep_id
  from public.beta_testers bt
  where bt.email is not null and trim(bt.email) <> ''
)
delete from public.beta_testers bt
using ranked r
where bt.id = r.id and r.id <> r.keep_id;

create unique index if not exists beta_testers_email_unique_idx on public.beta_testers(email);
create unique index if not exists beta_applications_email_unique_idx on public.beta_applications(email);
create unique index if not exists beta_task_assignments_unique_week_task_idx on public.beta_task_assignments(task_id, tester_id, assigned_week_start);
