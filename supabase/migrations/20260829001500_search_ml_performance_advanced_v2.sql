begin;

create table if not exists public.search_ml_query_embedding_cache (
  cache_key text primary key,
  normalized_text text not null,
  embedding vector(384) not null,
  embedding_model text not null,
  embedding_version text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.search_ml_query_embedding_cache enable row level security;
create index if not exists search_ml_query_embedding_cache_expires_idx
  on public.search_ml_query_embedding_cache(expires_at);
revoke all on table public.search_ml_query_embedding_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.search_ml_query_embedding_cache to service_role;

create index if not exists search_result_ml_features_location_confidence_idx
  on public.search_result_ml_features(location_id, confidence_score desc nulls last, sample_size desc nulls last)
  where location_id is not null;
create index if not exists location_review_ml_features_location_idx
  on public.location_review_ml_features(location_id);
create index if not exists booking_likelihood_ml_features_location_idx
  on public.booking_likelihood_ml_features(location_id);
create index if not exists business_quality_ml_features_location_idx
  on public.business_quality_ml_features(location_id);
create index if not exists location_pair_ml_features_pair_lookup_idx
  on public.location_pair_ml_features(restaurant_location_id, activity_location_id, confidence_score desc nulls last);
create index if not exists market_ml_features_market_key_idx
  on public.market_ml_features(market_key);

create or replace function public.match_hf_location_search_embeddings(
  p_query_embedding vector(384),
  p_expected_domain text,
  p_market_key text default null,
  p_match_count integer default 100,
  p_min_similarity numeric default 0.50,
  p_embedding_version text default 'hf-bge-small-en-v1.5:v2',
  p_food_intent boolean default false
) returns table(location_id uuid, similarity numeric, semantic_similarity numeric, food_similarity numeric)
language sql
stable
security definer
set search_path = public
as $$
  with general_candidates as materialized (
    select
      e.location_id,
      (1 - (e.embedding <=> p_query_embedding))::numeric as semantic_similarity,
      case when e.food_embedding is null then null::numeric else (1 - (e.food_embedding <=> p_query_embedding))::numeric end as food_similarity
    from public.location_search_embeddings_hf e
    join public.locations l on l.id = e.location_id
    where e.status = 'ready'
      and e.embedding is not null
      and e.embedding_provider = 'huggingface'
      and e.embedding_version = p_embedding_version
      and e.canonical_search_type in (p_expected_domain, 'hybrid')
      and (p_market_key is null or p_market_key = '' or lower(coalesce(e.market_key, '')) = lower(p_market_key))
      and coalesce(l.is_searchable, true) = true
      and coalesce(l.is_hidden, false) = false
      and coalesce(l.active, true) = true
      and l.deleted_at is null
      and lower(coalesce(l.status, '')) not in ('closed','permanently_closed','archived','deleted','hidden')
      and lower(coalesce(l.duplicate_status, '')) not in ('duplicate','secondary','merged')
    order by e.embedding <=> p_query_embedding
    limit greatest(20, least(coalesce(p_match_count, 100) * 2, 250))
  ),
  food_candidates as materialized (
    select
      e.location_id,
      (1 - (e.embedding <=> p_query_embedding))::numeric as semantic_similarity,
      (1 - (e.food_embedding <=> p_query_embedding))::numeric as food_similarity
    from public.location_search_embeddings_hf e
    join public.locations l on l.id = e.location_id
    where p_food_intent
      and p_expected_domain = 'restaurant'
      and e.status = 'ready'
      and e.embedding is not null
      and e.food_embedding is not null
      and e.embedding_provider = 'huggingface'
      and e.embedding_version = p_embedding_version
      and e.canonical_search_type in (p_expected_domain, 'hybrid')
      and (p_market_key is null or p_market_key = '' or lower(coalesce(e.market_key, '')) = lower(p_market_key))
      and coalesce(l.is_searchable, true) = true
      and coalesce(l.is_hidden, false) = false
      and coalesce(l.active, true) = true
      and l.deleted_at is null
      and lower(coalesce(l.status, '')) not in ('closed','permanently_closed','archived','deleted','hidden')
      and lower(coalesce(l.duplicate_status, '')) not in ('duplicate','secondary','merged')
    order by e.food_embedding <=> p_query_embedding
    limit greatest(20, least(coalesce(p_match_count, 100) * 2, 250))
  ),
  combined as (
    select * from general_candidates
    union all
    select * from food_candidates
  ),
  ranked as (
    select
      c.location_id,
      max(c.semantic_similarity)::numeric as semantic_similarity,
      max(c.food_similarity)::numeric as food_similarity,
      case
        when p_food_intent and p_expected_domain = 'restaurant'
          then greatest(max(c.semantic_similarity), coalesce(max(c.food_similarity), -1))
        else max(c.semantic_similarity)
      end::numeric as similarity
    from combined c
    group by c.location_id
  )
  select r.location_id, r.similarity, r.semantic_similarity, r.food_similarity
  from ranked r
  where r.similarity >= p_min_similarity
  order by r.similarity desc
  limit greatest(1, least(coalesce(p_match_count, 100), 250));
$$;

revoke all on function public.match_hf_location_search_embeddings(vector, text, text, integer, numeric, text, boolean) from public, anon, authenticated;
grant execute on function public.match_hf_location_search_embeddings(vector, text, text, integer, numeric, text, boolean) to service_role;

create or replace function public.get_search_v2_advanced_location_features(
  p_location_ids uuid[]
) returns table(
  location_id uuid,
  result_quality_score numeric,
  result_confidence_score numeric,
  negative_feedback_rate numeric,
  result_sample_size integer,
  overall_review_quality_score numeric,
  review_confidence_score numeric,
  quiet_score numeric,
  loud_score numeric,
  romantic_score numeric,
  group_score numeric,
  family_score numeric,
  upscale_score numeric,
  casual_score numeric,
  lively_score numeric,
  relaxed_score numeric,
  booking_likelihood_score numeric,
  booking_confidence_score numeric,
  business_trust_score numeric,
  duplicate_risk_score numeric,
  ml_vibes text[],
  ml_features text[],
  ml_occasions text[],
  ml_audiences text[],
  ml_tag_confidence numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with requested as (
    select unnest(coalesce(p_location_ids, '{}'::uuid[])) as location_id
  ),
  result_best as (
    select distinct on (f.location_id)
      f.location_id,
      f.result_quality_score,
      f.confidence_score,
      f.negative_feedback_rate,
      f.sample_size
    from public.search_result_ml_features f
    where f.location_id = any(coalesce(p_location_ids, '{}'::uuid[]))
    order by f.location_id, f.confidence_score desc nulls last, f.sample_size desc nulls last, f.updated_at desc nulls last
  )
  select
    r.location_id,
    rb.result_quality_score,
    rb.confidence_score as result_confidence_score,
    rb.negative_feedback_rate,
    rb.sample_size as result_sample_size,
    rv.overall_review_quality_score,
    rv.review_confidence_score,
    rv.quiet_score,
    rv.loud_score,
    rv.romantic_score,
    rv.group_score,
    rv.family_score,
    rv.upscale_score,
    rv.casual_score,
    rv.lively_score,
    rv.relaxed_score,
    bl.booking_likelihood_score,
    bl.booking_confidence_score,
    bq.business_trust_score,
    bq.duplicate_risk_score,
    la.vibes as ml_vibes,
    la.features as ml_features,
    la.occasions as ml_occasions,
    la.audiences as ml_audiences,
    la.confidence as ml_tag_confidence
  from requested r
  left join result_best rb on rb.location_id = r.location_id
  left join public.location_review_ml_features rv on rv.location_id = r.location_id
  left join public.booking_likelihood_ml_features bl on bl.location_id = r.location_id
  left join public.business_quality_ml_features bq on bq.location_id = r.location_id
  left join public.location_ml_attributes la on la.location_id = r.location_id and la.status = 'ready';
$$;

revoke all on function public.get_search_v2_advanced_location_features(uuid[]) from public, anon, authenticated;
grant execute on function public.get_search_v2_advanced_location_features(uuid[]) to service_role;

commit;
