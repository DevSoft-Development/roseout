begin;

create extension if not exists vector;

create table if not exists public.location_search_embeddings_hf (
  location_id uuid primary key references public.locations(id) on delete cascade,
  embedding vector(384) not null,
  food_embedding vector(384),
  canonical_search_type text not null,
  market_key text,
  embedding_provider text not null default 'huggingface',
  embedding_model text not null default 'BAAI/bge-small-en-v1.5',
  embedding_version text not null default 'hf-bge-small-en-v1.5:v2',
  semantic_document_hash text not null,
  semantic_document_version text not null,
  food_document_hash text,
  food_document_version text,
  status text not null default 'ready' check (status in ('ready','pending','stale','failed','disabled')),
  calculated_at timestamptz not null default now(),
  error_message text
);

alter table public.location_search_embeddings_hf enable row level security;

create index if not exists location_search_embeddings_hf_hnsw_idx
  on public.location_search_embeddings_hf using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index if not exists location_search_food_embeddings_hf_hnsw_idx
  on public.location_search_embeddings_hf using hnsw (food_embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where food_embedding is not null;

create index if not exists location_search_embeddings_hf_filter_idx
  on public.location_search_embeddings_hf(canonical_search_type, market_key, embedding_version, status);

create table if not exists public.hf_search_embedding_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null,
  embedding_provider text not null default 'huggingface',
  embedding_model text not null,
  embedding_version text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_scanned integer not null default 0,
  records_updated integer not null default 0,
  records_unchanged integer not null default 0,
  records_failed integer not null default 0,
  errors jsonb not null default '[]'::jsonb
);

alter table public.hf_search_embedding_runs enable row level security;

create table if not exists public.search_intent_training_examples (
  id uuid primary key default gen_random_uuid(),
  search_id text,
  raw_query text not null,
  normalized_query text not null,
  parser_source text not null,
  llm_model text,
  confidence numeric,
  search_plan jsonb not null default '{}'::jsonb,
  ambiguity_reasons text[] not null default '{}'::text[],
  relationship_type text,
  outcome text,
  request_fulfilled boolean,
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.search_intent_training_examples enable row level security;
create index if not exists search_intent_training_examples_review_idx
  on public.search_intent_training_examples(review_status, created_at desc);
create index if not exists search_intent_training_examples_normalized_idx
  on public.search_intent_training_examples(normalized_query);

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
  order by
    case
      when e.location_id is null then 0
      when e.status <> 'ready' then 1
      when e.embedding_version <> p_embedding_version then 2
      else 3
    end,
    e.calculated_at asc nulls first,
    coalesce(l.updated_at, l.created_at) asc nulls first,
    l.id
  limit greatest(1, least(coalesce(p_limit, 50), 250));
$$;

revoke all on table public.location_search_embeddings_hf from anon, authenticated;
revoke all on table public.hf_search_embedding_runs from anon, authenticated;
revoke all on table public.search_intent_training_examples from anon, authenticated;
grant select, insert, update, delete on table public.location_search_embeddings_hf to service_role;
grant select, insert, update, delete on table public.hf_search_embedding_runs to service_role;
grant select, insert, update, delete on table public.search_intent_training_examples to service_role;

revoke all on function public.match_hf_location_search_embeddings(vector, text, text, integer, numeric, text, boolean) from public, anon, authenticated;
grant execute on function public.match_hf_location_search_embeddings(vector, text, text, integer, numeric, text, boolean) to service_role;

revoke all on function public.get_hf_search_embedding_backfill_candidates(integer, text) from public, anon, authenticated;
grant execute on function public.get_hf_search_embedding_backfill_candidates(integer, text) to service_role;

create or replace function public.verify_hf_semantic_shadow()
returns table(check_name text, ok boolean, details text)
language sql
stable
security invoker
set search_path = public
as $$
  select 'hf_embedding_table', to_regclass('public.location_search_embeddings_hf') is not null, 'general + food 384-dimensional Hugging Face embeddings'
  union all
  select 'hf_embedding_runs', to_regclass('public.hf_search_embedding_runs') is not null, 'Hugging Face backfill run telemetry'
  union all
  select 'hf_intent_training', to_regclass('public.search_intent_training_examples') is not null, 'LLM-to-small-model learning corpus'
  union all
  select 'hf_match_rpc', to_regprocedure('public.match_hf_location_search_embeddings(vector,text,text,integer,numeric,text,boolean)') is not null, 'hybrid semantic/menu RPC'
  union all
  select 'hf_backfill_rpc', to_regprocedure('public.get_hf_search_embedding_backfill_candidates(integer,text)') is not null, 'version-aware bounded backfill RPC';
$$;

revoke all on function public.verify_hf_semantic_shadow() from public, anon, authenticated;
grant execute on function public.verify_hf_semantic_shadow() to service_role;

commit;
