create table if not exists public.platform_error_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  environment text not null default 'production',
  error_type text not null,
  severity text not null default 'error',
  message text not null,
  user_visible boolean not null default false,
  route text,
  url text,
  source text,
  status_code integer,
  request_id text,
  user_id uuid,
  anonymous_id text,
  session_id text,
  location_id uuid,
  fingerprint text,
  stack text,
  metadata jsonb not null default '{}'::jsonb,
  constraint platform_error_events_severity_check check (severity in ('info','warning','error','critical'))
);

alter table public.platform_error_events enable row level security;
revoke all on public.platform_error_events from anon, authenticated;
grant all on public.platform_error_events to service_role;

create index if not exists platform_error_events_occurred_at_idx on public.platform_error_events (occurred_at desc);
create index if not exists platform_error_events_fingerprint_idx on public.platform_error_events (fingerprint, occurred_at desc);
create index if not exists platform_error_events_route_idx on public.platform_error_events (route, occurred_at desc);
create index if not exists platform_error_events_visible_idx on public.platform_error_events (user_visible, occurred_at desc);
create index if not exists platform_error_events_severity_idx on public.platform_error_events (severity, occurred_at desc);
