create table if not exists public.platform_telemetry_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  event_name text not null,
  session_id text null,
  anonymous_id text null,
  user_id uuid null,
  page_path text null,
  source text null,
  severity text null,
  message text null,
  error_code text null,
  component text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint platform_telemetry_event_type_check check (event_type in ('page_view','session_start','session_heartbeat','session_end','runtime_error','unhandled_rejection','user_visible_error','console_error','api_error','integration_error','recovered_error')),
  constraint platform_telemetry_severity_check check (severity is null or severity in ('info','warning','error','critical'))
);

alter table public.platform_telemetry_events enable row level security;
revoke all on table public.platform_telemetry_events from anon, authenticated;

grant select, insert, update, delete on table public.platform_telemetry_events to service_role;

create index if not exists platform_telemetry_events_occurred_at_idx on public.platform_telemetry_events (occurred_at desc);
create index if not exists platform_telemetry_events_event_type_idx on public.platform_telemetry_events (event_type, occurred_at desc);
create index if not exists platform_telemetry_events_session_idx on public.platform_telemetry_events (session_id, occurred_at desc) where session_id is not null;
create index if not exists platform_telemetry_events_page_idx on public.platform_telemetry_events (page_path, occurred_at desc) where page_path is not null;
create index if not exists platform_telemetry_events_error_idx on public.platform_telemetry_events (severity, event_type, occurred_at desc) where event_type in ('runtime_error','unhandled_rejection','user_visible_error','console_error','api_error','integration_error');