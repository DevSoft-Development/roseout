begin;

create table if not exists public.search_internal_test_scenarios (
  id uuid primary key default gen_random_uuid(),
  scenario_key text not null unique,
  prompt text not null,
  expected_result_type text,
  expected_market text,
  expected_min_results integer not null default 1,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_internal_test_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  status text not null default 'pending',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  scenario_count integer not null default 0,
  passed_count integer not null default 0,
  failed_count integer not null default 0,
  warning_count integer not null default 0,
  evaluation_score numeric not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.search_internal_test_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.search_internal_test_runs(id) on delete cascade,
  scenario_id uuid not null references public.search_internal_test_scenarios(id) on delete cascade,
  search_id text,
  status text not null default 'pending',
  result_count integer not null default 0,
  matched_result_type boolean,
  matched_market boolean,
  attribution_rate numeric,
  duplicate_rate numeric,
  max_rank_shift integer,
  mean_absolute_rank_shift numeric,
  top3_overlap_rate numeric,
  evaluation_score numeric not null default 0,
  findings jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  unique(run_id, scenario_id)
);

alter table public.search_internal_test_scenarios enable row level security;
alter table public.search_internal_test_runs enable row level security;
alter table public.search_internal_test_results enable row level security;
revoke all on public.search_internal_test_scenarios from anon, authenticated;
revoke all on public.search_internal_test_runs from anon, authenticated;
revoke all on public.search_internal_test_results from anon, authenticated;

create index if not exists search_internal_test_runs_started_idx
  on public.search_internal_test_runs(started_at desc);
create index if not exists search_internal_test_results_run_idx
  on public.search_internal_test_results(run_id, status);

insert into public.search_internal_test_scenarios (
  scenario_key,
  prompt,
  expected_result_type,
  expected_market,
  expected_min_results,
  metadata
) values
  ('paired_walkable', 'Steak dinner and rooftop drinks within a 30 minute walk', 'pair', 'NYC', 1, '{"category":"paired","requires_walkable":true}'::jsonb),
  ('restaurant_only', 'Seafood rooftop restaurant in Queens', 'restaurant', 'NYC', 1, '{"category":"restaurant"}'::jsonb),
  ('activity_only', 'Fun activity with my teenage son in Queens', 'activity', 'NYC', 1, '{"category":"activity"}'::jsonb),
  ('long_island_pair', 'Family dinner and mini golf after on Long Island', 'pair', 'Long Island', 1, '{"category":"paired"}'::jsonb),
  ('nightlife_pair', 'Birthday dinner with karaoke and cocktails', 'pair', 'NYC', 1, '{"category":"paired"}'::jsonb),
  ('sports_bar', 'Best bar to watch the Knicks game in Harlem', 'activity', 'NYC', 1, '{"category":"sports_watch"}'::jsonb)
on conflict (scenario_key) do update set
  prompt = excluded.prompt,
  expected_result_type = excluded.expected_result_type,
  expected_market = excluded.expected_market,
  expected_min_results = excluded.expected_min_results,
  metadata = excluded.metadata,
  active = true,
  updated_at = now();

create or replace function public.create_internal_search_test_run(
  p_run_key text default null,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_run_key text;
  v_scenario_count integer;
begin
  v_run_key := coalesce(nullif(btrim(p_run_key), ''), 'phase4b-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-MS'));

  select count(*) into v_scenario_count
  from public.search_internal_test_scenarios
  where active = true;

  insert into public.search_internal_test_runs (
    run_key,
    status,
    scenario_count,
    created_by,
    summary
  ) values (
    v_run_key,
    'pending',
    v_scenario_count,
    p_created_by,
    jsonb_build_object('mode', 'internal_test', 'live_reranking_applied', false)
  ) returning id into v_run_id;

  insert into public.search_internal_test_results (run_id, scenario_id, status)
  select v_run_id, id, 'pending'
  from public.search_internal_test_scenarios
  where active = true;

  return jsonb_build_object(
    'ok', true,
    'run_id', v_run_id,
    'run_key', v_run_key,
    'scenario_count', v_scenario_count,
    'live_reranking_applied', false
  );
end;
$$;

create or replace function public.evaluate_internal_search_test_run(
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passed integer := 0;
  v_failed integer := 0;
  v_warnings integer := 0;
  v_scenarios integer := 0;
  v_score numeric := 0;
begin
  update public.search_internal_test_runs
  set status = 'evaluating'
  where id = p_run_id;

  with scenario_searches as (
    select
      r.id as result_id,
      r.run_id,
      r.scenario_id,
      s.scenario_key,
      s.expected_result_type,
      s.expected_market,
      s.expected_min_results,
      max(i.search_id) filter (
        where coalesce(i.metadata->>'test_run_id', '') = run.run_key
          and coalesce(i.metadata->>'scenario_key', '') = s.scenario_key
      ) as search_id
    from public.search_internal_test_results r
    join public.search_internal_test_runs run on run.id = r.run_id
    join public.search_internal_test_scenarios s on s.id = r.scenario_id
    left join public.search_result_impressions i
      on coalesce(i.metadata->>'test_run_id', '') = run.run_key
     and coalesce(i.metadata->>'scenario_key', '') = s.scenario_key
    where r.run_id = p_run_id
    group by r.id, r.run_id, r.scenario_id, s.scenario_key,
      s.expected_result_type, s.expected_market, s.expected_min_results
  ),
  metrics as (
    select
      ss.*,
      count(i.*)::int as result_count,
      bool_or(i.result_type = ss.expected_result_type) as matched_result_type,
      bool_or(coalesce(i.market, '') ilike '%' || coalesce(ss.expected_market, '') || '%') as matched_market,
      coalesce(
        count(distinct e.id) filter (where e.search_id = ss.search_id)::numeric /
        nullif(count(distinct i.dedupe_key), 0),
        0
      ) as attribution_rate,
      coalesce(
        (count(e.id) - count(distinct e.event_id))::numeric /
        nullif(count(e.id), 0),
        0
      ) as duplicate_rate,
      coalesce(max(abs(sr.rank_change)), 0)::int as max_rank_shift,
      coalesce(avg(abs(sr.rank_change)), 0) as mean_absolute_rank_shift,
      coalesce(
        count(*) filter (where sr.live_rank <= 3 and sr.shadow_rank <= 3)::numeric /
        nullif(count(*) filter (where sr.live_rank <= 3 or sr.shadow_rank <= 3), 0),
        1
      ) as top3_overlap_rate
    from scenario_searches ss
    left join public.search_result_impressions i on i.search_id = ss.search_id
    left join public.location_analytics_events e on e.search_id = ss.search_id
    left join public.search_shadow_rankings sr on sr.search_id = ss.search_id
    group by ss.result_id, ss.run_id, ss.scenario_id, ss.scenario_key,
      ss.expected_result_type, ss.expected_market, ss.expected_min_results, ss.search_id
  )
  update public.search_internal_test_results r
  set
    search_id = m.search_id,
    result_count = m.result_count,
    matched_result_type = coalesce(m.matched_result_type, false),
    matched_market = case when m.expected_market is null then true else coalesce(m.matched_market, false) end,
    attribution_rate = m.attribution_rate,
    duplicate_rate = m.duplicate_rate,
    max_rank_shift = m.max_rank_shift,
    mean_absolute_rank_shift = m.mean_absolute_rank_shift,
    top3_overlap_rate = m.top3_overlap_rate,
    evaluation_score = greatest(0, least(100,
      (case when m.result_count >= m.expected_min_results then 25 else 0 end)
      + (case when coalesce(m.matched_result_type, false) then 20 else 0 end)
      + (case when m.expected_market is null or coalesce(m.matched_market, false) then 10 else 0 end)
      + least(25, m.attribution_rate * 25)
      + greatest(0, 10 - m.duplicate_rate * 100)
      + greatest(0, 10 - greatest(0, m.max_rank_shift - 5))
    )),
    status = case
      when m.search_id is null then 'pending'
      when m.result_count < m.expected_min_results then 'failed'
      when not coalesce(m.matched_result_type, false) then 'failed'
      when m.duplicate_rate > 0.02 then 'warning'
      when m.attribution_rate < 0.95 then 'warning'
      when m.max_rank_shift > 5 then 'warning'
      else 'passed'
    end,
    findings = jsonb_build_object(
      'scenario_key', m.scenario_key,
      'expected_min_results', m.expected_min_results,
      'live_reranking_applied', false,
      'shadow_only', true
    ),
    evaluated_at = now()
  from metrics m
  where r.id = m.result_id;

  select
    count(*)::int,
    count(*) filter (where status = 'passed')::int,
    count(*) filter (where status = 'failed')::int,
    count(*) filter (where status = 'warning')::int,
    coalesce(avg(evaluation_score), 0)
  into v_scenarios, v_passed, v_failed, v_warnings, v_score
  from public.search_internal_test_results
  where run_id = p_run_id;

  update public.search_internal_test_runs
  set
    status = case when v_failed > 0 then 'failed' when v_warnings > 0 then 'warning' else 'passed' end,
    completed_at = now(),
    scenario_count = v_scenarios,
    passed_count = v_passed,
    failed_count = v_failed,
    warning_count = v_warnings,
    evaluation_score = v_score,
    summary = jsonb_build_object(
      'pass_rate', case when v_scenarios > 0 then v_passed::numeric / v_scenarios else 0 end,
      'live_reranking_applied', false,
      'mode', 'shadow_only'
    )
  where id = p_run_id;

  return jsonb_build_object(
    'ok', true,
    'run_id', p_run_id,
    'scenario_count', v_scenarios,
    'passed', v_passed,
    'failed', v_failed,
    'warnings', v_warnings,
    'evaluation_score', v_score,
    'live_reranking_applied', false
  );
end;
$$;

create or replace view public.search_internal_test_run_scorecard_v1
with (security_invoker = true)
as
select
  run.id,
  run.run_key,
  run.status,
  run.started_at,
  run.completed_at,
  run.scenario_count,
  run.passed_count,
  run.failed_count,
  run.warning_count,
  run.evaluation_score,
  coalesce(avg(result.attribution_rate), 0) as average_attribution_rate,
  coalesce(avg(result.duplicate_rate), 0) as average_duplicate_rate,
  coalesce(max(result.max_rank_shift), 0) as maximum_rank_shift,
  coalesce(avg(result.mean_absolute_rank_shift), 0) as average_rank_shift,
  coalesce(avg(result.top3_overlap_rate), 0) as average_top3_overlap,
  run.summary
from public.search_internal_test_runs run
left join public.search_internal_test_results result on result.run_id = run.id
group by run.id;

revoke all on public.search_internal_test_run_scorecard_v1 from anon, authenticated;
revoke all on function public.create_internal_search_test_run(text, uuid) from public;
revoke all on function public.evaluate_internal_search_test_run(uuid) from public;

grant execute on function public.create_internal_search_test_run(text, uuid) to service_role;
grant execute on function public.evaluate_internal_search_test_run(uuid) to service_role;

commit;
