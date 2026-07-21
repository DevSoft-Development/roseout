create table if not exists public.search_ranking_guardrail_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  evaluation_window_minutes integer not null default 60 check (evaluation_window_minutes between 15 and 1440),
  minimum_sample_size integer not null default 50 check (minimum_sample_size >= 1),
  max_no_result_rate_delta numeric(8,4) not null default 0.0500,
  max_p95_latency_ms integer not null default 2500 check (max_p95_latency_ms > 0),
  max_pair_count_drop numeric(8,4) not null default 0.2000,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.search_ranking_guardrail_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.search_ranking_rollout_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('evaluation','warning','automatic_rollback','manual_disable','acknowledged')),
  status text not null check (status in ('healthy','warning','rollback','acknowledged')),
  reason text,
  control_sample_size integer not null default 0,
  hybrid_sample_size integer not null default 0,
  control_no_result_rate numeric(8,4),
  hybrid_no_result_rate numeric(8,4),
  control_p95_latency_ms numeric,
  hybrid_p95_latency_ms numeric,
  control_avg_pair_count numeric,
  hybrid_avg_pair_count numeric,
  settings_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists search_ranking_rollout_events_created_at_idx
  on public.search_ranking_rollout_events (created_at desc);

alter table public.search_ranking_guardrail_settings enable row level security;
alter table public.search_ranking_rollout_events enable row level security;
revoke all on public.search_ranking_guardrail_settings from anon, authenticated;
revoke all on public.search_ranking_rollout_events from anon, authenticated;
grant all on public.search_ranking_guardrail_settings to service_role;
grant all on public.search_ranking_rollout_events to service_role;

create or replace view public.search_ranking_guardrail_health_v1
with (security_invoker = true) as
with settings as (
  select * from public.search_ranking_guardrail_settings where id = true
), metrics as (
  select
    variant,
    count(*)::integer as sample_size,
    avg((no_results)::int)::numeric(8,4) as no_result_rate,
    percentile_cont(0.95) within group (order by latency_ms) as p95_latency_ms,
    avg(pair_count)::numeric(12,2) as avg_pair_count
  from public.search_ranking_experiments, settings
  where created_at >= now() - make_interval(mins => settings.evaluation_window_minutes)
    and coalesce((metadata->>'test_mode')::boolean, false) = false
  group by variant
)
select
  settings.enabled,
  settings.evaluation_window_minutes,
  settings.minimum_sample_size,
  settings.max_no_result_rate_delta,
  settings.max_p95_latency_ms,
  settings.max_pair_count_drop,
  coalesce(control.sample_size, 0) as control_sample_size,
  coalesce(hybrid.sample_size, 0) as hybrid_sample_size,
  control.no_result_rate as control_no_result_rate,
  hybrid.no_result_rate as hybrid_no_result_rate,
  control.p95_latency_ms as control_p95_latency_ms,
  hybrid.p95_latency_ms as hybrid_p95_latency_ms,
  control.avg_pair_count as control_avg_pair_count,
  hybrid.avg_pair_count as hybrid_avg_pair_count
from settings
left join metrics control on control.variant = 'control'
left join metrics hybrid on hybrid.variant = 'hybrid';

revoke all on public.search_ranking_guardrail_health_v1 from anon, authenticated;
grant select on public.search_ranking_guardrail_health_v1 to service_role;
