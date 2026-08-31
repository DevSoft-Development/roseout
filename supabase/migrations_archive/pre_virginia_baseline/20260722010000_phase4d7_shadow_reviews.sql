create table if not exists public.search_ranking_experiment_reviews (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.search_ranking_experiments(id) on delete cascade,
  decision text not null check (decision in ('better','same','worse','unsafe','needs_review')),
  reason_tags text[] not null default '{}',
  notes text,
  reviewed_by uuid,
  reviewed_at timestamptz not null default now(),
  unique (experiment_id)
);

create index if not exists search_ranking_experiment_reviews_decision_idx
  on public.search_ranking_experiment_reviews (decision, reviewed_at desc);

alter table public.search_ranking_experiment_reviews enable row level security;
revoke all on public.search_ranking_experiment_reviews from anon, authenticated;
grant all on public.search_ranking_experiment_reviews to service_role;

create or replace view public.search_ranking_shadow_validation_v1
with (security_invoker = true) as
select
  count(*)::integer as shadow_searches,
  count(*) filter (where coalesce((e.metadata->>'test_mode')::boolean, false))::integer as test_mode_searches,
  count(*) filter (where e.restaurant_control_order is distinct from e.restaurant_hybrid_order or e.activity_control_order is distinct from e.activity_hybrid_order)::integer as changed_order_searches,
  avg(case when e.restaurant_control_order is distinct from e.restaurant_hybrid_order or e.activity_control_order is distinct from e.activity_hybrid_order then 1 else 0 end)::numeric(8,4) as changed_order_rate,
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
where coalesce((e.metadata->>'test_mode')::boolean, false) = true;

create or replace view public.search_ranking_shadow_readiness_v1
with (security_invoker = true) as
with validation as (
  select * from public.search_ranking_shadow_validation_v1
), approval as (
  select exists (
    select 1
    from public.search_ranking_rollout_stage_history
    where to_stage_key = 'admin_5'
      and reason ilike '%shadow approval%'
  ) as superadmin_approved
)
select
  validation.*,
  approval.superadmin_approved,
  case when reviewed_searches > 0 then worse_reviews::numeric / reviewed_searches else 0 end as worse_rate,
  (
    shadow_searches >= 25
    and reviewed_searches >= 10
    and unsafe_reviews = 0
    and (case when reviewed_searches > 0 then worse_reviews::numeric / reviewed_searches else 0 end) <= 0.20
    and coalesce(p95_latency_ms, 0) <= 2500
    and approval.superadmin_approved
  ) as ready_for_admin_5,
  array_remove(array[
    case when shadow_searches < 25 then 'insufficient_shadow_searches' end,
    case when reviewed_searches < 10 then 'insufficient_manual_reviews' end,
    case when unsafe_reviews > 0 then 'unsafe_review_present' end,
    case when reviewed_searches > 0 and worse_reviews::numeric / reviewed_searches > 0.20 then 'worse_rate_too_high' end,
    case when coalesce(p95_latency_ms, 0) > 2500 then 'latency_too_high' end,
    case when not approval.superadmin_approved then 'superadmin_approval_required' end
  ], null) as blocking_reasons
from validation, approval;

revoke all on public.search_ranking_shadow_validation_v1 from anon, authenticated;
revoke all on public.search_ranking_shadow_readiness_v1 from anon, authenticated;
grant select on public.search_ranking_shadow_validation_v1 to service_role;
grant select on public.search_ranking_shadow_readiness_v1 to service_role;
