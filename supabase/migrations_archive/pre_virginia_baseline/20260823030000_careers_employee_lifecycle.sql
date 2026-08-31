alter table public.career_team_conversions
  add column if not exists company_email text,
  add column if not exists microsoft_user_id text,
  add column if not exists admin_role text,
  add column if not exists team_type text,
  add column if not exists provisioning_status text not null default 'pending',
  add column if not exists offboarding_status text not null default 'not_started',
  add column if not exists provisioned_at timestamptz,
  add column if not exists offboarded_at timestamptz,
  add column if not exists offboarded_by uuid,
  add column if not exists welcome_sent_at timestamptz,
  add column if not exists last_error text,
  add column if not exists lifecycle_metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists career_team_conversions_application_uidx
  on public.career_team_conversions(application_id)
  where application_id is not null;
create unique index if not exists career_team_conversions_company_email_uidx
  on public.career_team_conversions(lower(company_email))
  where company_email is not null;

alter table public.career_email_events
  add column if not exists dedupe_key text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz;
create unique index if not exists career_email_events_dedupe_uidx
  on public.career_email_events(dedupe_key)
  where dedupe_key is not null;

create table if not exists public.career_job_provisioning_profiles (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.career_jobs(id) on delete cascade,
  admin_role text not null check (admin_role in ('manager','editor','reviewer','ambassador','experience','partner_ambassador','experience_team','viewer')),
  team_type text check (team_type is null or team_type in ('ambassador','experience_team','sales_team','support_team','manager')),
  department text,
  permissions jsonb not null default '{}'::jsonb,
  allowed_work_types text[] not null default '{}',
  pay_type text default 'unpaid',
  hourly_rate numeric,
  include_in_payroll boolean not null default false,
  can_clock_in boolean not null default false,
  can_track_work boolean not null default false,
  can_do_site_visits boolean not null default false,
  can_do_social_outreach boolean not null default false,
  can_work_support_tickets boolean not null default false,
  can_send_claim_codes boolean not null default false,
  can_send_owner_password_reset boolean not null default false,
  can_use_demo_mode boolean not null default true,
  microsoft_license_sku_id text,
  microsoft_groups text[] not null default '{}',
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.career_employee_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  conversion_id uuid references public.career_team_conversions(id) on delete cascade,
  application_id uuid references public.career_applications(id) on delete set null,
  event_type text not null,
  step text,
  status text not null default 'completed' check (status in ('pending','completed','failed','skipped')),
  actor_user_id uuid,
  details jsonb not null default '{}'::jsonb,
  error text,
  occurred_at timestamptz not null default now()
);
create index if not exists career_employee_lifecycle_events_conversion_idx
  on public.career_employee_lifecycle_events(conversion_id, occurred_at desc);
create index if not exists career_employee_lifecycle_events_application_idx
  on public.career_employee_lifecycle_events(application_id, occurred_at desc);

alter table public.career_job_provisioning_profiles enable row level security;
alter table public.career_employee_lifecycle_events enable row level security;

drop policy if exists "service role manages career job provisioning profiles" on public.career_job_provisioning_profiles;
create policy "service role manages career job provisioning profiles"
  on public.career_job_provisioning_profiles for all to service_role
  using (true) with check (true);

drop policy if exists "service role manages career employee lifecycle events" on public.career_employee_lifecycle_events;
create policy "service role manages career employee lifecycle events"
  on public.career_employee_lifecycle_events for all to service_role
  using (true) with check (true);

grant all on table public.career_job_provisioning_profiles to service_role;
grant all on table public.career_employee_lifecycle_events to service_role;

create or replace function public.career_set_application_stage(
  p_application_id uuid,
  p_stage text,
  p_changed_by uuid default null,
  p_reason text default null
) returns public.career_applications
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old_stage text;
  v_row public.career_applications;
begin
  if p_stage not in ('submitted','portfolio_review','under_review','shortlisted','interview_requested','interview_scheduled','interview_completed','content_test','offer_pending','offer_sent','hired','not_selected','withdrawn','talent_pool') then
    raise exception 'invalid career application stage';
  end if;

  select stage into v_old_stage
  from public.career_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'career application not found';
  end if;

  update public.career_applications
  set stage = p_stage, status = p_stage, updated_at = now()
  where id = p_application_id
  returning * into v_row;

  if v_old_stage is distinct from p_stage then
    insert into public.career_application_stage_history(
      application_id, from_stage, to_stage, changed_by, change_reason
    ) values (
      p_application_id, v_old_stage, p_stage, p_changed_by, coalesce(p_reason, 'Career workflow stage update')
    );
  end if;

  return v_row;
end;
$$;
revoke all on function public.career_set_application_stage(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.career_set_application_stage(uuid,text,uuid,text) to service_role;

insert into public.career_job_provisioning_profiles (
  job_id, admin_role, team_type, department, pay_type, include_in_payroll,
  can_clock_in, can_track_work, can_do_site_visits, can_do_social_outreach,
  can_work_support_tickets, can_send_claim_codes, can_send_owner_password_reset,
  can_use_demo_mode, allowed_work_types
)
select
  j.id,
  case
    when j.slug = 'experience-team-associate' then 'experience'
    when j.slug in ('partner-ambassador','campus-ambassador') then 'ambassador'
    else 'viewer'
  end,
  case
    when j.slug = 'experience-team-associate' then 'experience_team'
    when j.slug in ('partner-ambassador','campus-ambassador') then 'ambassador'
    else null
  end,
  j.department,
  case when j.is_paid then 'hourly' else 'unpaid' end,
  false,
  j.slug in ('experience-team-associate','partner-ambassador','campus-ambassador'),
  j.slug in ('experience-team-associate','partner-ambassador','campus-ambassador'),
  j.slug in ('partner-ambassador','campus-ambassador'),
  j.slug in ('partner-ambassador','campus-ambassador'),
  j.slug = 'experience-team-associate',
  j.slug in ('partner-ambassador','campus-ambassador'),
  j.slug = 'experience-team-associate',
  true,
  case
    when j.slug = 'experience-team-associate' then array['support_ticket']::text[]
    when j.slug in ('partner-ambassador','campus-ambassador') then array['site_visit','social_outreach']::text[]
    else '{}'::text[]
  end
from public.career_jobs j
on conflict (job_id) do nothing;

drop trigger if exists set_career_job_provisioning_profiles_updated_at on public.career_job_provisioning_profiles;
create trigger set_career_job_provisioning_profiles_updated_at
before update on public.career_job_provisioning_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_career_team_conversions_updated_at on public.career_team_conversions;
create trigger set_career_team_conversions_updated_at
before update on public.career_team_conversions
for each row execute function public.set_updated_at();
