create table if not exists public.search_ranking_rollout_runs (
  id uuid primary key default gen_random_uuid(),
  stage_key text not null references public.search_ranking_rollout_stages(stage_key),
  status text not null default 'active' check (status in ('active','completed','rolled_back','cancelled')),
  started_by uuid,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  completion_reason text,
  baseline_snapshot jsonb not null default '{}'::jsonb,
  final_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists search_ranking_rollout_runs_one_active_idx
  on public.search_ranking_rollout_runs ((status))
  where status = 'active';

create table if not exists public.search_ranking_rollout_approvals (
  id uuid primary key default gen_random_uuid(),
  rollout_run_id uuid not null references public.search_ranking_rollout_runs(id) on delete cascade,
  target_stage_key text not null references public.search_ranking_rollout_stages(stage_key),
  decision text not null check (decision in ('approved','rejected','revoked')),
  reason text not null,
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  metrics_snapshot jsonb not null default '{}'::jsonb,
  unique (rollout_run_id, target_stage_key)
);

create table if not exists public.search_ranking_rollout_alerts (
  id uuid primary key default gen_random_uuid(),
  rollout_run_id uuid references public.search_ranking_rollout_runs(id) on delete set null,
  severity text not null check (severity in ('info','warning','critical')),
  alert_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists search_ranking_rollout_alerts_open_idx
  on public.search_ranking_rollout_alerts (severity, created_at desc)
  where acknowledged_at is null;

create table if not exists public.search_ranking_rollout_audit_log (
  id uuid primary key default gen_random_uuid(),
  rollout_run_id uuid references public.search_ranking_rollout_runs(id) on delete set null,
  actor_user_id uuid,
  action text not null,
  from_stage_key text,
  to_stage_key text,
  reason text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists search_ranking_rollout_audit_created_idx
  on public.search_ranking_rollout_audit_log (created_at desc);

create table if not exists public.search_ranking_retention_settings (
  id boolean primary key default true check (id),
  experiment_retention_days integer not null default 90 check (experiment_retention_days between 7 and 730),
  audit_retention_days integer not null default 365 check (audit_retention_days between 30 and 2555),
  alert_retention_days integer not null default 180 check (alert_retention_days between 30 and 730),
  enabled boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.search_ranking_retention_settings (id, enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.search_ranking_rollout_runs enable row level security;
alter table public.search_ranking_rollout_approvals enable row level security;
alter table public.search_ranking_rollout_alerts enable row level security;
alter table public.search_ranking_rollout_audit_log enable row level security;
alter table public.search_ranking_retention_settings enable row level security;

revoke all on public.search_ranking_rollout_runs from anon, authenticated;
revoke all on public.search_ranking_rollout_approvals from anon, authenticated;
revoke all on public.search_ranking_rollout_alerts from anon, authenticated;
revoke all on public.search_ranking_rollout_audit_log from anon, authenticated;
revoke all on public.search_ranking_retention_settings from anon, authenticated;

grant all on public.search_ranking_rollout_runs to service_role;
grant all on public.search_ranking_rollout_approvals to service_role;
grant all on public.search_ranking_rollout_alerts to service_role;
grant all on public.search_ranking_rollout_audit_log to service_role;
grant all on public.search_ranking_retention_settings to service_role;

create or replace view public.search_ranking_shadow_validation_v2
with (security_invoker = true) as
select
  count(*)::integer as shadow_searches,
  count(*) filter (
    where lower(coalesce(e.metadata->>'test_mode','false')) in ('true','1','yes','on')
  )::integer as test_mode_searches,
  count(*) filter (
    where e.restaurant_control_order is distinct from e.restaurant_hybrid_order
       or e.activity_control_order is distinct from e.activity_hybrid_order
  )::integer as changed_order_searches,
  avg(case when e.restaurant_control_order is distinct from e.restaurant_hybrid_order
             or e.activity_control_order is distinct from e.activity_hybrid_order
           then 1 else 0 end)::numeric(8,4) as changed_order_rate,
  avg(e.latency_ms)::numeric(12,2) as avg_latency_ms,
  percentile_cont(0.95) within group (order by e.latency_ms) as p95_latency_ms,
  avg((e.no_results)::int)::numeric(8,4) as no_result_rate,
  avg(e.pair_count)::numeric(12,2) as avg_pair_count,
  count(r.id)::integer as reviewed_searches,
  count(r.id) filter (where r.decision = 'better')::integer as better_reviews,
  count(r.id) filter (where r.decision = 'same')::integer as same_reviews,
  count(r.id) filter (where r.decision = 'worse')::integer as worse_reviews,
  count(r.id) filter (where r.decision = 'unsafe')::integer as unsafe_reviews,
  count(r.id) filter (where r.decision = 'needs_review')::integer as needs_review_reviews
from public.search_ranking_experiments e
left join public.search_ranking_experiment_reviews r on r.experiment_id = e.id
where lower(coalesce(e.metadata->>'test_mode','false')) in ('true','1','yes','on');

create or replace view public.search_ranking_rollout_completion_readiness_v1
with (security_invoker = true) as
with current_state as (
  select s.stage_key, s.stage_started_at, s.last_decision, s.last_decision_reasons
  from public.search_ranking_rollout_stage_state s
  where s.id = true
),
active_run as (
  select * from public.search_ranking_rollout_runs where status = 'active' limit 1
),
validation as (
  select * from public.search_ranking_shadow_validation_v2
),
health as (
  select * from public.search_ranking_guardrail_health_v1 limit 1
),
open_alerts as (
  select count(*)::integer as critical_alerts
  from public.search_ranking_rollout_alerts
  where acknowledged_at is null and severity = 'critical'
),
approval as (
  select exists (
    select 1
    from public.search_ranking_rollout_approvals a, active_run r
    where a.rollout_run_id = r.id
      and a.target_stage_key = 'admin_5'
      and a.decision = 'approved'
      and a.revoked_at is null
  ) as admin_5_approved
)
select
  c.stage_key as current_stage,
  r.id as rollout_run_id,
  r.status as rollout_run_status,
  v.shadow_searches,
  v.reviewed_searches,
  v.unsafe_reviews,
  case when v.reviewed_searches > 0 then v.worse_reviews::numeric / v.reviewed_searches else 0 end as worse_rate,
  v.p95_latency_ms,
  coalesce(o.critical_alerts,0) as open_critical_alerts,
  a.admin_5_approved,
  (
    c.stage_key = 'admin_shadow'
    and v.shadow_searches >= 25
    and v.reviewed_searches >= 10
    and v.unsafe_reviews = 0
    and (case when v.reviewed_searches > 0 then v.worse_reviews::numeric / v.reviewed_searches else 0 end) <= 0.20
    and coalesce(v.p95_latency_ms,0) <= 2500
    and coalesce(o.critical_alerts,0) = 0
    and a.admin_5_approved
  ) as ready_for_admin_5,
  array_remove(array[
    case when c.stage_key <> 'admin_shadow' then 'admin_shadow_not_active' end,
    case when r.id is null then 'no_active_rollout_run' end,
    case when v.shadow_searches < 25 then 'insufficient_shadow_searches' end,
    case when v.reviewed_searches < 10 then 'insufficient_manual_reviews' end,
    case when v.unsafe_reviews > 0 then 'unsafe_review_present' end,
    case when v.reviewed_searches > 0 and v.worse_reviews::numeric / v.reviewed_searches > 0.20 then 'worse_rate_too_high' end,
    case when coalesce(v.p95_latency_ms,0) > 2500 then 'latency_too_high' end,
    case when coalesce(o.critical_alerts,0) > 0 then 'critical_alert_open' end,
    case when not a.admin_5_approved then 'superadmin_approval_required' end
  ], null) as blocking_reasons
from current_state c
left join active_run r on true
left join validation v on true
left join health h on true
left join open_alerts o on true
left join approval a on true;

grant select on public.search_ranking_shadow_validation_v2 to service_role;
grant select on public.search_ranking_rollout_completion_readiness_v1 to service_role;
revoke all on public.search_ranking_shadow_validation_v2 from anon, authenticated;
revoke all on public.search_ranking_rollout_completion_readiness_v1 from anon, authenticated;

create or replace function public.start_search_ranking_rollout_run(
  target_stage_key text,
  actor_user_id uuid,
  reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  run_id uuid;
  current_snapshot jsonb;
begin
  if exists (select 1 from public.search_ranking_rollout_runs where status = 'active') then
    raise exception 'An active rollout run already exists';
  end if;

  select to_jsonb(r) into current_snapshot
  from public.search_ranking_rollout_readiness_v1 r
  limit 1;

  insert into public.search_ranking_rollout_runs (
    stage_key, status, started_by, baseline_snapshot, completion_reason
  ) values (
    target_stage_key, 'active', actor_user_id, coalesce(current_snapshot,'{}'::jsonb), reason
  ) returning id into run_id;

  insert into public.search_ranking_rollout_audit_log (
    rollout_run_id, actor_user_id, action, to_stage_key, reason
  ) values (
    run_id, actor_user_id, 'rollout_run_started', target_stage_key, reason
  );

  return run_id;
end;
$$;

create or replace function public.record_search_ranking_rollout_approval(
  rollout_run_id uuid,
  target_stage_key text,
  actor_user_id uuid,
  decision text,
  reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  approval_id uuid;
  snapshot jsonb;
begin
  if decision not in ('approved','rejected','revoked') then
    raise exception 'Invalid approval decision';
  end if;

  select to_jsonb(r) into snapshot
  from public.search_ranking_rollout_completion_readiness_v1 r
  limit 1;

  insert into public.search_ranking_rollout_approvals (
    rollout_run_id, target_stage_key, decision, reason, approved_by,
    revoked_at, revoked_by, metrics_snapshot
  ) values (
    rollout_run_id, target_stage_key, decision, reason, actor_user_id,
    case when decision = 'revoked' then now() else null end,
    case when decision = 'revoked' then actor_user_id else null end,
    coalesce(snapshot,'{}'::jsonb)
  )
  on conflict (rollout_run_id, target_stage_key) do update set
    decision = excluded.decision,
    reason = excluded.reason,
    approved_by = excluded.approved_by,
    approved_at = now(),
    revoked_at = excluded.revoked_at,
    revoked_by = excluded.revoked_by,
    metrics_snapshot = excluded.metrics_snapshot
  returning id into approval_id;

  insert into public.search_ranking_rollout_audit_log (
    rollout_run_id, actor_user_id, action, to_stage_key, reason,
    metadata
  ) values (
    rollout_run_id, actor_user_id, 'rollout_approval_' || decision,
    target_stage_key, reason, jsonb_build_object('approval_id', approval_id)
  );

  return approval_id;
end;
$$;

create or replace function public.complete_search_ranking_rollout_run(
  rollout_run_id uuid,
  actor_user_id uuid,
  final_status text,
  reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot jsonb;
begin
  if final_status not in ('completed','rolled_back','cancelled') then
    raise exception 'Invalid final rollout status';
  end if;

  select to_jsonb(r) into snapshot
  from public.search_ranking_rollout_completion_readiness_v1 r
  limit 1;

  update public.search_ranking_rollout_runs
  set status = final_status,
      completed_at = now(),
      completion_reason = reason,
      final_snapshot = coalesce(snapshot,'{}'::jsonb),
      updated_at = now()
  where id = rollout_run_id and status = 'active';

  if not found then
    raise exception 'Active rollout run not found';
  end if;

  insert into public.search_ranking_rollout_audit_log (
    rollout_run_id, actor_user_id, action, reason,
    metadata
  ) values (
    rollout_run_id, actor_user_id, 'rollout_run_' || final_status,
    reason, coalesce(snapshot,'{}'::jsonb)
  );
end;
$$;

create or replace function public.cleanup_search_ranking_rollout_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.search_ranking_retention_settings%rowtype;
  experiments_deleted integer := 0;
  alerts_deleted integer := 0;
  audit_deleted integer := 0;
begin
  select * into settings from public.search_ranking_retention_settings where id = true;
  if not coalesce(settings.enabled,false) then
    return jsonb_build_object('enabled',false,'experiments_deleted',0,'alerts_deleted',0,'audit_deleted',0);
  end if;

  delete from public.search_ranking_experiments
  where created_at < now() - make_interval(days => settings.experiment_retention_days);
  get diagnostics experiments_deleted = row_count;

  delete from public.search_ranking_rollout_alerts
  where created_at < now() - make_interval(days => settings.alert_retention_days)
    and acknowledged_at is not null;
  get diagnostics alerts_deleted = row_count;

  delete from public.search_ranking_rollout_audit_log
  where created_at < now() - make_interval(days => settings.audit_retention_days);
  get diagnostics audit_deleted = row_count;

  return jsonb_build_object(
    'enabled',true,
    'experiments_deleted',experiments_deleted,
    'alerts_deleted',alerts_deleted,
    'audit_deleted',audit_deleted
  );
end;
$$;

revoke all on function public.start_search_ranking_rollout_run(text,uuid,text) from public, anon, authenticated;
revoke all on function public.record_search_ranking_rollout_approval(uuid,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.complete_search_ranking_rollout_run(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.cleanup_search_ranking_rollout_data() from public, anon, authenticated;
grant execute on function public.start_search_ranking_rollout_run(text,uuid,text) to service_role;
grant execute on function public.record_search_ranking_rollout_approval(uuid,text,uuid,text,text) to service_role;
grant execute on function public.complete_search_ranking_rollout_run(uuid,uuid,text,text) to service_role;
grant execute on function public.cleanup_search_ranking_rollout_data() to service_role;

update public.search_ranking_rollout_stage_state
set automatic_promotion_enabled = false,
    updated_at = now()
where id = true;
