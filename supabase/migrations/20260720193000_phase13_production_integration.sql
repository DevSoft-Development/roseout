begin;

create extension if not exists vector;

create table if not exists public.location_search_embeddings (
  location_id uuid primary key references public.locations(id) on delete cascade,
  embedding vector(1536) not null,
  canonical_search_type text not null,
  market_key text,
  embedding_model text not null default 'text-embedding-3-small',
  embedding_version text not null default 'search-embedding:v1',
  semantic_document_hash text not null,
  semantic_document_version text not null,
  status text not null default 'ready' check (status in ('ready','pending','stale','failed','disabled')),
  calculated_at timestamptz not null default now(),
  error_message text
);

create index if not exists location_search_embeddings_ivfflat_idx
  on public.location_search_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists location_search_embeddings_filter_idx
  on public.location_search_embeddings(canonical_search_type, market_key, embedding_version, status);

create table if not exists public.search_embedding_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null,
  embedding_model text not null,
  embedding_version text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_scanned integer not null default 0,
  records_updated integer not null default 0,
  records_failed integer not null default 0,
  errors jsonb not null default '[]'::jsonb
);

create or replace function public.match_location_search_embeddings(
  p_query_embedding vector(1536),
  p_expected_domain text,
  p_market_key text default null,
  p_match_count integer default 100,
  p_min_similarity numeric default 0.55,
  p_embedding_version text default 'search-embedding:v1'
) returns table(location_id uuid, similarity numeric)
language sql stable security definer set search_path = public as $$
  select e.location_id, (1 - (e.embedding <=> p_query_embedding))::numeric as similarity
  from public.location_search_embeddings e
  join public.locations l on l.id = e.location_id
  where e.status = 'ready'
    and e.embedding_version = p_embedding_version
    and e.canonical_search_type in (p_expected_domain, 'hybrid')
    and (p_market_key is null or p_market_key = '' or lower(coalesce(e.market_key, '')) = lower(p_market_key))
    and coalesce(l.is_searchable, true) = true
    and coalesce(l.is_hidden, false) = false
    and coalesce(l.active, true) = true
    and l.deleted_at is null
    and lower(coalesce(l.status, '')) not in ('closed','permanently_closed','archived','deleted','hidden')
    and lower(coalesce(l.duplicate_status, '')) not in ('duplicate','secondary','merged')
    and (1 - (e.embedding <=> p_query_embedding)) >= p_min_similarity
  order by e.embedding <=> p_query_embedding
  limit greatest(1, least(p_match_count, 250));
$$;

create or replace function public.recalculate_behavioral_search_features(p_window interval default interval '30 days')
returns jsonb language plpgsql security definer set search_path = public as $$
declare updated_count integer := 0;
begin
  insert into public.search_result_ml_features (
    location_id, feature_window, impression_count, seen_impression_count, click_count, save_count,
    reservation_complete_count, call_count, website_click_count, outing_complete_count,
    negative_feedback_count, immediate_research_count, seen_ctr, save_rate, conversion_rate,
    completion_rate, negative_feedback_rate, sample_size, confidence_score, calculated_at,
    data_window_start, data_window_end, feature_version, status, result_quality_score
  )
  select
    i.location_id,
    '30d',
    count(*)::int,
    count(*)::int,
    count(*) filter (where a.event_name in ('result_clicked','location_clicked'))::int,
    count(*) filter (where a.event_name in ('result_saved','location_saved'))::int,
    count(*) filter (where a.event_name = 'reservation_completed')::int,
    count(*) filter (where a.event_name in ('call_clicked','phone_clicked'))::int,
    count(*) filter (where a.event_name = 'website_clicked')::int,
    count(*) filter (where a.event_name = 'outing_completed')::int,
    count(n.id)::int,
    count(*) filter (where a.event_name = 'immediate_research')::int,
    coalesce(count(*) filter (where a.event_name in ('result_clicked','location_clicked'))::numeric / nullif(count(*),0),0),
    coalesce(count(*) filter (where a.event_name in ('result_saved','location_saved'))::numeric / nullif(count(*),0),0),
    coalesce(count(*) filter (where a.event_name in ('reservation_completed','call_clicked','website_clicked'))::numeric / nullif(count(*),0),0),
    coalesce(count(*) filter (where a.event_name = 'outing_completed')::numeric / nullif(count(*),0),0),
    coalesce(count(n.id)::numeric / nullif(count(*),0),0),
    count(*)::int,
    least(1, ln(1 + count(*)) / ln(101)),
    now(), now() - p_window, now(), 'behavioral_phase2_v1',
    case when count(*) < 25 then 'low_sample' else 'ready' end,
    greatest(0, least(100, 50
      + coalesce(count(*) filter (where a.event_name in ('result_clicked','location_clicked'))::numeric / nullif(count(*),0),0) * 20
      + coalesce(count(*) filter (where a.event_name in ('result_saved','location_saved'))::numeric / nullif(count(*),0),0) * 25
      + coalesce(count(*) filter (where a.event_name = 'outing_completed')::numeric / nullif(count(*),0),0) * 35
      - coalesce(count(n.id)::numeric / nullif(count(*),0),0) * 35))
  from public.search_result_impressions i
  left join public.analytics_events a on a.search_id::text = i.search_id and a.location_id = i.location_id and coalesce(a.occurred_at,a.created_at) >= now() - p_window
  left join public.search_negative_feedback n on n.search_id = i.search_id and n.location_id = i.location_id and n.created_at >= now() - p_window
  where i.location_id is not null and i.created_at >= now() - p_window
  group by i.location_id
  on conflict (location_id) do update set
    impression_count = excluded.impression_count,
    seen_impression_count = excluded.seen_impression_count,
    click_count = excluded.click_count,
    save_count = excluded.save_count,
    reservation_complete_count = excluded.reservation_complete_count,
    call_count = excluded.call_count,
    website_click_count = excluded.website_click_count,
    outing_complete_count = excluded.outing_complete_count,
    negative_feedback_count = excluded.negative_feedback_count,
    immediate_research_count = excluded.immediate_research_count,
    seen_ctr = excluded.seen_ctr,
    save_rate = excluded.save_rate,
    conversion_rate = excluded.conversion_rate,
    completion_rate = excluded.completion_rate,
    negative_feedback_rate = excluded.negative_feedback_rate,
    sample_size = excluded.sample_size,
    confidence_score = excluded.confidence_score,
    calculated_at = excluded.calculated_at,
    data_window_start = excluded.data_window_start,
    data_window_end = excluded.data_window_end,
    feature_version = excluded.feature_version,
    status = excluded.status,
    result_quality_score = excluded.result_quality_score;
  get diagnostics updated_count = row_count;
  insert into public.behavioral_feature_runs(run_type,status,completed_at,records_updated,feature_version,source_window_start,source_window_end)
    values ('recalculate_search_result_features','completed',now(),updated_count,'behavioral_phase2_v1',now()-p_window,now());
  return jsonb_build_object('ok',true,'records_updated',updated_count);
end;
$$;

create or replace function public.verify_phase13_production_integration()
returns table(check_name text, ok boolean, details text) language sql stable as $$
  select 'vector_extension', exists(select 1 from pg_extension where extname='vector'), 'pgvector extension'
  union all select 'embedding_table', to_regclass('public.location_search_embeddings') is not null, 'location_search_embeddings'
  union all select 'semantic_rpc', to_regprocedure('public.match_location_search_embeddings(vector,text,text,integer,numeric,text)') is not null, 'filtered semantic RPC'
  union all select 'behavior_rpc', to_regprocedure('public.recalculate_behavioral_search_features(interval)') is not null, 'behavioral aggregation RPC'
  union all select 'impressions_table', to_regclass('public.search_result_impressions') is not null, 'position-aware impressions'
  union all select 'behavior_features', to_regclass('public.search_result_ml_features') is not null, 'behavior feature storage';
$$;

commit;
