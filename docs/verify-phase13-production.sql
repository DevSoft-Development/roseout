-- Run after applying 20260720193000_phase13_production_integration.sql.
select * from public.verify_phase13_production_integration();

-- All rows should return ok = true.
select count(*) as failed_checks
from public.verify_phase13_production_integration()
where not ok;

-- Embedding coverage and freshness.
select
  count(*) filter (where status = 'ready') as ready_embeddings,
  count(*) filter (where status = 'failed') as failed_embeddings,
  count(*) filter (where calculated_at < now() - interval '30 days') as stale_embeddings,
  max(calculated_at) as latest_embedding
from public.location_search_embeddings;

-- Behavioral feature freshness.
select
  count(*) as feature_rows,
  count(*) filter (where status = 'ready') as ready_rows,
  count(*) filter (where status = 'low_sample') as low_sample_rows,
  count(*) filter (where calculated_at < now() - interval '2 days') as stale_rows,
  max(calculated_at) as latest_calculation
from public.search_result_ml_features
where feature_window = '30d';

-- Recent maintenance jobs.
select run_type, status, records_updated, records_failed, started_at, completed_at
from public.behavioral_feature_runs
order by started_at desc
limit 20;

select status, embedding_model, embedding_version, records_scanned, records_updated, records_failed, started_at, completed_at
from public.search_embedding_runs
order by started_at desc
limit 20;
