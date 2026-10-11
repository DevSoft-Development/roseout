-- Monitoring-only records: no POS transaction, device, or merchant writes.
create table if not exists public.pos_monitor_scan_runs (
 id uuid primary key default gen_random_uuid(),
 scan_day date not null,
 status text not null default 'running' check (status in ('running','complete','failed')),
 next_offset integer not null default 0 check (next_offset >= 0),
 scanned integer not null default 0,
 counts jsonb not null default '{"healthy":0,"expected_offline":0,"awaiting_startup":0,"needs_attention":0,"unknown":0}'::jsonb,
 started_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 finished_at timestamptz,
 error text,
 unique(scan_day)
);
create table if not exists public.pos_monitor_location_history (
 id bigint generated always as identity primary key,
 scan_id uuid not null references public.pos_monitor_scan_runs(id) on delete cascade,
 location_id text not null,
 observed_at timestamptz not null default now(),
 state text not null check (state in ('healthy','expected_offline','awaiting_startup','needs_attention','unknown')),
 device_count integer not null default 0,
 attention_count integer not null default 0,
 unique(scan_id,location_id)
);
create index if not exists pos_monitor_location_history_location_time_idx on public.pos_monitor_location_history(location_id,observed_at desc);
create table if not exists public.pos_monitor_device_incidents (
 device_id text primary key,
 location_id text not null,
 state text not null check (state in ('open','resolved')),
 reason text not null,
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 last_notified_at timestamptz,
 resolved_at timestamptz
);
create index if not exists pos_monitor_device_incidents_location_idx on public.pos_monitor_device_incidents(location_id,state);
alter table public.pos_monitor_scan_runs enable row level security;
alter table public.pos_monitor_location_history enable row level security;
alter table public.pos_monitor_device_incidents enable row level security;
revoke all on public.pos_monitor_scan_runs,public.pos_monitor_location_history,public.pos_monitor_device_incidents from anon,authenticated;
grant select,insert,update,delete on public.pos_monitor_scan_runs,public.pos_monitor_location_history,public.pos_monitor_device_incidents to service_role;
grant usage,select on sequence public.pos_monitor_location_history_id_seq to service_role;
