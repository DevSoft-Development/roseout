begin;

create table if not exists public.search_inventory_embeddings_hf (
  source_kind text not null check (source_kind in ('event','experience')),
  source_id uuid not null,
  location_id uuid references public.locations(id) on delete cascade,
  market_key text,
  city text,
  borough text,
  state text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  searchable boolean not null default true,
  semantic_document text not null,
  document_hash text not null,
  embedding vector(384) not null,
  embedding_model text not null default 'BAAI/bge-small-en-v1.5',
  embedding_version text not null default 'hf-bge-small-en-v1.5:v2',
  calculated_at timestamptz not null default now(),
  error_message text,
  primary key (source_kind, source_id)
);
alter table public.search_inventory_embeddings_hf enable row level security;
create index if not exists search_inventory_embeddings_hf_hnsw_idx
  on public.search_inventory_embeddings_hf using hnsw (embedding vector_cosine_ops)
  with (m=16, ef_construction=64);
create index if not exists search_inventory_embeddings_hf_filter_idx
  on public.search_inventory_embeddings_hf(source_kind, searchable, status, market_key, starts_at);
revoke all on table public.search_inventory_embeddings_hf from public, anon, authenticated;
grant select, insert, update, delete on table public.search_inventory_embeddings_hf to service_role;

create or replace function public.match_hf_search_inventory_embeddings(
  p_query_embedding vector(384),
  p_source_kinds text[] default array['event','experience']::text[],
  p_market_key text default null,
  p_match_count integer default 40,
  p_min_similarity numeric default 0.48,
  p_embedding_version text default 'hf-bge-small-en-v1.5:v2'
) returns table(
  source_kind text,
  source_id uuid,
  location_id uuid,
  similarity numeric,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security invoker
set search_path=public
as $$
  select
    e.source_kind,
    e.source_id,
    e.location_id,
    (1-(e.embedding<=>p_query_embedding))::numeric as similarity,
    e.starts_at,
    e.ends_at
  from public.search_inventory_embeddings_hf e
  where e.searchable = true
    and e.embedding_version = p_embedding_version
    and e.source_kind = any(coalesce(p_source_kinds, array['event','experience']::text[]))
    and (p_market_key is null or p_market_key='' or lower(coalesce(e.market_key,''))=lower(p_market_key))
    and (e.source_kind <> 'event' or coalesce(e.ends_at,e.starts_at,now()) >= now() - interval '6 hours')
    and (1-(e.embedding<=>p_query_embedding)) >= p_min_similarity
  order by e.embedding<=>p_query_embedding
  limit greatest(1,least(coalesce(p_match_count,40),100));
$$;
revoke all on function public.match_hf_search_inventory_embeddings(vector,text[],text,integer,numeric,text) from public,anon,authenticated;
grant execute on function public.match_hf_search_inventory_embeddings(vector,text[],text,integer,numeric,text) to service_role;

create table if not exists public.location_photo_embeddings_siglip (
  photo_key text primary key,
  location_id uuid not null references public.locations(id) on delete cascade,
  photo_url text not null,
  embedding vector(768) not null,
  model text not null default 'google/siglip-base-patch16-224',
  model_version text not null default 'hf-siglip-base-patch16-224:v1',
  status text not null default 'ready' check (status in ('ready','pending','stale','failed','disabled')),
  calculated_at timestamptz not null default now(),
  error_message text
);
alter table public.location_photo_embeddings_siglip enable row level security;
create index if not exists location_photo_embeddings_siglip_hnsw_idx
  on public.location_photo_embeddings_siglip using hnsw (embedding vector_cosine_ops)
  with (m=16,ef_construction=64);
create index if not exists location_photo_embeddings_siglip_location_idx
  on public.location_photo_embeddings_siglip(location_id,status,model_version);
revoke all on table public.location_photo_embeddings_siglip from public,anon,authenticated;
grant select,insert,update,delete on table public.location_photo_embeddings_siglip to service_role;

create or replace function public.match_location_photo_embeddings_siglip(
  p_query_embedding vector(768),
  p_match_count integer default 40,
  p_min_similarity numeric default 0.45,
  p_model_version text default 'hf-siglip-base-patch16-224:v1'
) returns table(location_id uuid,photo_url text,similarity numeric)
language sql
stable
security invoker
set search_path=public
as $$
  select p.location_id,p.photo_url,(1-(p.embedding<=>p_query_embedding))::numeric as similarity
  from public.location_photo_embeddings_siglip p
  join public.locations l on l.id=p.location_id
  where p.status='ready'
    and p.model_version=p_model_version
    and coalesce(l.is_searchable,true)=true
    and coalesce(l.is_hidden,false)=false
    and coalesce(l.active,true)=true
    and l.deleted_at is null
    and lower(coalesce(l.status,'')) not in ('closed','permanently_closed','archived','deleted','hidden')
    and lower(coalesce(l.duplicate_status,'')) not in ('duplicate','secondary','merged')
    and (1-(p.embedding<=>p_query_embedding)) >= p_min_similarity
  order by p.embedding<=>p_query_embedding
  limit greatest(1,least(coalesce(p_match_count,40),100));
$$;
revoke all on function public.match_location_photo_embeddings_siglip(vector,integer,numeric,text) from public,anon,authenticated;
grant execute on function public.match_location_photo_embeddings_siglip(vector,integer,numeric,text) to service_role;

create table if not exists public.search_reranker_training_examples (
  id uuid primary key default gen_random_uuid(),
  example_key text not null unique,
  query text not null,
  positive_document text not null,
  negative_document text not null,
  positive_location_id uuid references public.locations(id) on delete set null,
  negative_location_id uuid references public.locations(id) on delete set null,
  source text not null,
  signal_weight numeric not null default 1 check (signal_weight > 0 and signal_weight <= 5),
  market_key text,
  split text not null default 'train' check (split in ('train','validation','test')),
  review_status text not null default 'approved' check (review_status in ('candidate','approved','rejected')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.search_reranker_training_examples enable row level security;
create index if not exists search_reranker_training_examples_split_idx
  on public.search_reranker_training_examples(review_status,split,created_at desc);
revoke all on table public.search_reranker_training_examples from public,anon,authenticated;
grant select,insert,update,delete on table public.search_reranker_training_examples to service_role;

create table if not exists public.search_ml_model_registry (
  id uuid primary key default gen_random_uuid(),
  model_type text not null check (model_type in ('reranker','embedding','vision','translation')),
  model_version text not null,
  base_model text not null,
  artifact_uri text,
  status text not null default 'candidate' check (status in ('candidate','evaluated','approved','active','rejected','retired')),
  training_examples integer not null default 0,
  validation_examples integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  evaluation_thresholds jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  evaluated_at timestamptz,
  approved_at timestamptz,
  promoted_at timestamptz,
  unique(model_type,model_version)
);
alter table public.search_ml_model_registry enable row level security;
create unique index if not exists search_ml_model_registry_one_active_idx
  on public.search_ml_model_registry(model_type) where status='active';
revoke all on table public.search_ml_model_registry from public,anon,authenticated;
grant select,insert,update,delete on table public.search_ml_model_registry to service_role;

create table if not exists public.search_ml_training_runs (
  id uuid primary key default gen_random_uuid(),
  model_type text not null,
  requested_version text,
  status text not null check (status in ('blocked','running','trained','evaluated','promoted','failed')),
  training_examples integer not null default 0,
  validation_examples integer not null default 0,
  minimum_examples integer not null default 500,
  metrics jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);
alter table public.search_ml_training_runs enable row level security;
create index if not exists search_ml_training_runs_started_idx on public.search_ml_training_runs(started_at desc);
revoke all on table public.search_ml_training_runs from public,anon,authenticated;
grant select,insert,update,delete on table public.search_ml_training_runs to service_role;

commit;
