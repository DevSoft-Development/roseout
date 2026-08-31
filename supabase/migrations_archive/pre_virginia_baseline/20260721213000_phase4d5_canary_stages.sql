create table if not exists public.search_ranking_rollout_stages (
  stage_key text primary key,
  sort_order integer not null unique,
  rollout_percent integer not null check (rollout_percent between 0 and 100),
  admin_only boolean not null default true,
  eligible_markets text[] not null default array['nyc'],
  minimum_sample_size integer not null default 50 check (minimum_sample_size >= 0),
  minimum_observation_minutes integer not null default 60 check (minimum_observation_minutes >= 0),
  automatic_promotion_allowed boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.search_ranking_rollout_stages (
  stage_key, sort_order, rollout_percent, admin_only, eligible_markets,
  minimum_sample_size, minimum_observation_minutes, automatic_promotion_allowed
) values
  ('disabled', 0, 0, true, array['nyc'], 0, 0, false),
  ('admin_shadow', 10, 0, true, array['nyc'], 25, 60, false),
  ('admin_5', 20, 5, true, array['nyc'], 50, 120, false),
  ('admin_25', 30, 25, true, array['nyc'], 100, 240, false),
  ('internal_5', 40, 5, false, array['nyc'], 250, 360, false),
  ('public_1', 50, 1, false, array['nyc'], 500, 720, false),
  ('public_5', 60, 5, false, array['nyc'], 1000, 1440, false),
  ('public_25', 70, 25, false, array['nyc'], 2500, 1440, false),
  ('public_50', 80, 50, false, array['nyc'], 5000, 2880, false),
  ('full', 90, 100, false, array['nyc'], 10000, 4320, false)
on conflict (stage_key) do update set
  sort_order = excluded.sort_order,
  rollout_percent = excluded.rollout_percent,
  admin_only = excluded.admin_only,
  eligible_markets = excluded.eligible_markets,
  minimum_sample_size = excluded.minimum_sample_size,
  minimum_observation_minutes = excluded.minimum_observation_minutes,
  automatic_promotion_allowed = false,
  updated_at = now();

create table if not exists public.search_ranking_rollout_stage_state (
  id boolean primary key default true check (id),
  stage_key text not null references public.search_ranking_rollout_stages(stage_key),
  stage_started_at timestamptz not null default now(),
  automatic_promotion_enabled boolean not null default false,
  last_evaluated_at timestamptz,
  last_decision text,
  last_decision_reasons text[] not null default '{}',
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.search_ranking_rollout_stage_state (
  id, stage_key, automatic_promotion_enabled
) values (true, 'disabled', false)
on conflict (id) do nothing;

create table if not exists public.search_ranking_rollout_stage_history (
  id uuid primary key default gen_random_uuid(),
  from_stage_key text references public.search_ranking_rollout_stages(stage_key),
  to_stage_key text not null references public.search_ranking_rollout_stages(stage_key),
  change_type text not null check (change_type in ('manual_promotion','manual_demotion','automatic_rollback','initialization')),
  reason text,
  metrics_snapshot jsonb not null default '{}'::jsonb,
  changed_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists search_ranking_rollout_stage_history_created_at_idx
  on public.search_ranking_rollout_stage_history (created_at desc);

create table if not exists public.search_ranking_rollout_evaluation_locks (
  lock_key text primary key,
  locked_until timestamptz not null,
  locked_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace view public.search_ranking_rollout_readiness_v1
with (security_invoker = true) as
with current_state as (
  select s.*, d.sort_order, d.rollout_percent, d.admin_only,
         d.minimum_sample_size, d.minimum_observation_minutes
  from public.search_ranking_rollout_stage_state s
  join public.search_ranking_rollout_stages d on d.stage_key = s.stage_key
  where s.id = true
),
next_stage as (
  select d.*
  from public.search_ranking_rollout_stages d, current_state c
  where d.enabled = true and d.sort_order > c.sort_order
  order by d.sort_order
  limit 1
),
health as (
  select * from public.search_ranking_guardrail_health_v1 limit 1
)
select
  c.stage_key as current_stage,
  c.stage_started_at,
  extract(epoch from (now() - c.stage_started_at)) / 60.0 as minutes_in_stage,
  c.minimum_observation_minutes,
  c.minimum_sample_size,
  coalesce(h.control_sample_size, 0) as control_sample_size,
  coalesce(h.hybrid_sample_size, 0) as hybrid_sample_size,
  c.last_evaluated_at,
  c.last_decision,
  c.last_decision_reasons,
  n.stage_key as next_stage,
  n.rollout_percent as next_rollout_percent,
  (
    extract(epoch from (now() - c.stage_started_at)) / 60.0 >= c.minimum_observation_minutes
    and coalesce(h.control_sample_size, 0) >= c.minimum_sample_size
    and coalesce(h.hybrid_sample_size, 0) >= c.minimum_sample_size
    and coalesce(c.last_decision, '') = 'healthy'
  ) as ready_to_promote,
  array_remove(array[
    case when extract(epoch from (now() - c.stage_started_at)) / 60.0 < c.minimum_observation_minutes then 'observation_window_incomplete' end,
    case when coalesce(h.control_sample_size, 0) < c.minimum_sample_size then 'insufficient_control_sample' end,
    case when coalesce(h.hybrid_sample_size, 0) < c.minimum_sample_size then 'insufficient_hybrid_sample' end,
    case when coalesce(c.last_decision, '') <> 'healthy' then 'guardrail_not_healthy' end
  ], null) as blocking_reasons,
  false as automatic_promotion_enabled
from current_state c
left join next_stage n on true
left join health h on true;

alter table public.search_ranking_rollout_stages enable row level security;
alter table public.search_ranking_rollout_stage_state enable row level security;
alter table public.search_ranking_rollout_stage_history enable row level security;
alter table public.search_ranking_rollout_evaluation_locks enable row level security;

revoke all on public.search_ranking_rollout_stages from anon, authenticated;
revoke all on public.search_ranking_rollout_stage_state from anon, authenticated;
revoke all on public.search_ranking_rollout_stage_history from anon, authenticated;
revoke all on public.search_ranking_rollout_evaluation_locks from anon, authenticated;
revoke all on public.search_ranking_rollout_readiness_v1 from anon, authenticated;

grant all on public.search_ranking_rollout_stages to service_role;
grant all on public.search_ranking_rollout_stage_state to service_role;
grant all on public.search_ranking_rollout_stage_history to service_role;
grant all on public.search_ranking_rollout_evaluation_locks to service_role;
grant select on public.search_ranking_rollout_readiness_v1 to service_role;

update public.search_ranking_rollout_settings
set enabled = false,
    rollout_percent = 0,
    admin_only = true,
    shadow_test_enabled = false,
    updated_at = now()
where id = true;

update public.search_ranking_guardrail_settings
set enabled = false,
    updated_at = now()
where id = true;
