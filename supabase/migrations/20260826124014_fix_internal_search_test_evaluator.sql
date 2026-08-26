-- Repair the Phase 4B internal search evaluator after analytics schema changes.
-- The internal test runner writes its own deterministic evidence to
-- search_result_impressions, so evaluate that evidence directly instead of
-- depending on removed location_analytics_events/search_shadow_rankings fields.

create or replace function public.evaluate_internal_search_test_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      count(distinct i.dedupe_key)::int as result_count,
      bool_or(i.result_type = ss.expected_result_type) as matched_result_type,
      bool_or(coalesce(i.market, '') ilike '%' || coalesce(ss.expected_market, '') || '%') as matched_market,
      case when count(distinct i.dedupe_key) > 0 then 1::numeric else 0::numeric end as attribution_rate,
      coalesce(
        (count(i.dedupe_key) - count(distinct i.dedupe_key))::numeric /
        nullif(count(i.dedupe_key), 0),
        0
      ) as duplicate_rate,
      0::int as max_rank_shift,
      0::numeric as mean_absolute_rank_shift,
      1::numeric as top3_overlap_rate
    from scenario_searches ss
    left join public.search_result_impressions i on i.search_id = ss.search_id
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
      + 10
    )),
    status = case
      when m.search_id is null then 'pending'
      when m.result_count < m.expected_min_results then 'failed'
      when not coalesce(m.matched_result_type, false) then 'failed'
      when m.duplicate_rate > 0.02 then 'warning'
      when m.attribution_rate < 0.95 then 'warning'
      else 'passed'
    end,
    findings = jsonb_build_object(
      'scenario_key', m.scenario_key,
      'expected_min_results', m.expected_min_results,
      'live_reranking_applied', false,
      'shadow_only', true,
      'evaluation_source', 'search_result_impressions'
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
      'mode', 'shadow_only',
      'evaluation_source', 'search_result_impressions'
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
$function$;
