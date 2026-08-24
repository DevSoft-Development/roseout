create table if not exists public.marketing_saved_reports (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  report_type text not null,
  date_range text not null default 'last_30_days',
  comparison text not null default 'previous_period',
  breakdown text not null default 'day',
  filters jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_report_schedules (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.marketing_saved_reports(id) on delete cascade,
  name text not null,
  report_config jsonb not null default '{}'::jsonb,
  recipients text[] not null default '{}'::text[],
  cadence text not null default 'weekly' check (cadence in ('daily','weekly','monthly')),
  day_of_week smallint check (day_of_week between 0 and 6),
  day_of_month smallint check (day_of_month between 1 and 28),
  send_hour smallint not null default 8 check (send_hour between 0 and 23),
  send_minute smallint not null default 0 check (send_minute between 0 and 59),
  timezone text not null default 'America/New_York',
  next_run_at timestamptz,
  last_sent_at timestamptz,
  last_status text,
  last_error text,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketing_saved_reports enable row level security;
alter table public.marketing_report_schedules enable row level security;

revoke all on public.marketing_saved_reports from anon, authenticated;
revoke all on public.marketing_report_schedules from anon, authenticated;
grant all on public.marketing_saved_reports to service_role;
grant all on public.marketing_report_schedules to service_role;

create index if not exists marketing_report_schedules_due_idx on public.marketing_report_schedules (next_run_at) where is_active = true;
create index if not exists marketing_saved_reports_type_idx on public.marketing_saved_reports (report_type, created_at desc);
