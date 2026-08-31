-- Exact server-side KPI aggregation; callable only by the service-role-backed admin server.
create or replace function public.admin_search_health_kpis(p_from timestamptz, p_to timestamptz, p_source text default null)
returns table(total_searches bigint, healthy_searches bigint, searches_with_issues bigint, failed_searches bigint, slow_searches bigint, no_results bigint, no_pairs bigint)
language sql stable security invoker set search_path = '' as $$
  with classified as (
    select s.success = false as failed,
      coalesce(s.had_issue, false) or s.success = false or s.no_results_reason is not null or s.no_pairs_reason is not null or exists (
        -- Legacy fallback: normalized query plus a narrow time window. Future writers should
        -- put search_event_id in health.debug for direct correlation.
        select 1 from public.search_health_events h where h.created_at between s.created_at - interval '5 minutes' and s.created_at + interval '5 minutes'
          and lower(regexp_replace(trim(h.raw_query), '\s+', ' ', 'g')) = lower(regexp_replace(trim(coalesce(s.normalized_query,s.raw_query)), '\s+', ' ', 'g'))
      ) as issue,
      s.timing_ms > 5000 or lower(coalesce(s.speed_status, '')) = any(array['slow','critical','failed','timeout','degraded']) as slow,
      s.no_results_reason is not null or s.result_count = 0 as no_results,
      s.no_pairs_reason is not null as no_pairs
    from public.search_events s where s.created_at >= p_from and s.created_at <= p_to and (p_source is null or s.source = p_source)
  ) select count(*), count(*) filter (where not failed and not issue), count(*) filter (where issue), count(*) filter (where failed), count(*) filter (where slow), count(*) filter (where no_results), count(*) filter (where no_pairs) from classified;
$$;
revoke all on function public.admin_search_health_kpis(timestamptz,timestamptz,text) from public, anon, authenticated;
grant execute on function public.admin_search_health_kpis(timestamptz,timestamptz,text) to service_role;
create index if not exists idx_search_events_source_created_at on public.search_events(source, created_at desc);
create index if not exists idx_search_health_events_source_created_at on public.search_health_events(source, created_at desc);
