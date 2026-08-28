begin;

create extension if not exists vector;

create table if not exists public.location_search_embeddings_hf (
  location_id uuid primary key references public.locations(id) on delete cascade,
  embedding vector(384) not null,
  canonical_search_type text not null,
  market_key text,
  embedding_provider text not null default 'huggingface',
  embedding_model text not null default 'BAAI/bge-small-en-v1.5',
  embedding_version text not null default 'hf-bge-small-en-v1.5:v1',
  semantic_document_hash text not null,
  semantic_document_version text not null,
  status text not null default 'ready' check (status in ('ready','pending','stale','failed','disabled')),
  calculated_at timestamptz not null default now(),
  error_message text
);

alter table public.location_search_embeddings_hf enable row level security;

create index if not exists location_search_embeddings_hf_ivfflat_idx
  on public.location_search_embeddings_hf using ivfflat (embedding vector_cosine_ops) with (lists = 100);

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

create or replace function public.match_hf_location_search_embeddings(
  p_query_embedding vector(384),
  p_expected_domain text,
  p_market_key text default null,
  p_match_count integer default 100,
  p_min_similarity numeric default 0.55,
  p_embedding_version text default 'hf-bge-small-en-v1.5:v1'
) returns table(location_id uuid, similarity numeric)
language sql
stable
security definer
set search_path = public
as $$
  select e.location_id, (1 - (e.embedding <=> p_query_embedding))::numeric as similarity
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
    and (1 - (e.embedding <=> p_query_embedding)) >= p_min_similarity
  order by e.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 100), 250));
$$;

create or replace function public.get_hf_search_embedding_backfill_candidates(
  p_limit integer default 50
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
      else 2
    end,
    e.calculated_at asc nulls first,
    coalesce(l.updated_at, l.created_at) asc nulls first,
    l.id
  limit greatest(1, least(coalesce(p_limit, 50), 250));
$$;

revoke all on table public.location_search_embeddings_hf from anon, authenticated;
revoke all on table public.hf_search_embedding_runs from anon, authenticated;

revoke all on function public.match_hf_location_search_embeddings(vector, text, text, integer, numeric, text) from public, anon, authenticated;
grant execute on function public.match_hf_location_search_embeddings(vector, text, text, integer, numeric, text) to service_role;

revoke all on function public.get_hf_search_embedding_backfill_candidates(integer) from public, anon, authenticated;
grant execute on function public.get_hf_search_embedding_backfill_candidates(integer) to service_role;

create or replace function public.verify_hf_semantic_shadow()
returns table(check_name text, ok boolean, details text)
language sql
stable
security invoker
set search_path = public
as $$
  select 'hf_embedding_table', to_regclass('public.location_search_embeddings_hf') is not null, '384-dimensional Hugging Face shadow embeddings'
  union all
  select 'hf_embedding_runs', to_regclass('public.hf_search_embedding_runs') is not null, 'Hugging Face backfill run telemetry'
  union all
  select 'hf_match_rpc', to_regprocedure('public.match_hf_location_search_embeddings(vector,text,text,integer,numeric,text)') is not null, 'filtered semantic shadow RPC'
  union all
  select 'hf_backfill_rpc', to_regprocedure('public.get_hf_search_embedding_backfill_candidates(integer)') is not null, 'bounded backfill candidate RPC';
$$;

revoke all on function public.verify_hf_semantic_shadow() from public, anon, authenticated;
grant execute on function public.verify_hf_semantic_shadow() to service_role;

commit;
