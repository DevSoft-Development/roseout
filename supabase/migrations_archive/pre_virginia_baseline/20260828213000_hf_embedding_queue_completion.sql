begin;

alter table public.location_search_embeddings_hf
  alter column embedding drop not null;

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
  select ranked.location_id,
         ranked.similarity,
         ranked.semantic_similarity,
         ranked.food_similarity
  from (
    select
      e.location_id,
      (1 - (e.embedding <=> p_query_embedding))::numeric as semantic_similarity,
      case when e.food_embedding is null then null::numeric else (1 - (e.food_embedding <=> p_query_embedding))::numeric end as food_similarity,
      case
        when p_food_intent and e.food_embedding is not null
          then greatest(
            (1 - (e.embedding <=> p_query_embedding))::numeric,
            (1 - (e.food_embedding <=> p_query_embedding))::numeric
          )
        else (1 - (e.embedding <=> p_query_embedding))::numeric
      end as similarity
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
  ) ranked
  where ranked.similarity >= p_min_similarity
  order by ranked.similarity desc
  limit greatest(1, least(coalesce(p_match_count, 100), 250));
$$;

create or replace function public.get_hf_search_embedding_backfill_candidates(
  p_limit integer default 50,
  p_embedding_version text default 'hf-bge-small-en-v1.5:v2'
)
returns table(location_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select l.id
  from public.locations l
  left join public.location_search_embeddings_hf e on e.location_id = l.id
  where coalesce(l.is_searchable, true) = true
    and coalesce(l.is_hidden, false) = false
    and coalesce(l.active, true) = true
    and l.deleted_at is null
    and lower(coalesce(l.status, '')) not in ('closed', 'permanently_closed', 'archived', 'deleted', 'hidden')
    and lower(coalesce(l.duplicate_status, '')) not in ('duplicate', 'secondary', 'merged')
    and (
      e.location_id is null
      or (e.status <> 'disabled' and e.status <> 'ready')
      or (e.status = 'ready' and e.embedding_version <> p_embedding_version)
    )
  order by
    case
      when e.location_id is null then 0
      when e.status <> 'ready' then 1
      else 2
    end,
    e.calculated_at asc nulls first,
    coalesce(l.updated_at, l.created_at) asc nulls first,
    l.id
  limit greatest(1, least(coalesce(p_limit, 50), 250));
$$;

revoke all on function public.match_hf_location_search_embeddings(vector, text, text, integer, numeric, text, boolean) from public, anon, authenticated;
grant execute on function public.match_hf_location_search_embeddings(vector, text, text, integer, numeric, text, boolean) to service_role;
revoke all on function public.get_hf_search_embedding_backfill_candidates(integer, text) from public, anon, authenticated;
grant execute on function public.get_hf_search_embedding_backfill_candidates(integer, text) to service_role;

commit;
