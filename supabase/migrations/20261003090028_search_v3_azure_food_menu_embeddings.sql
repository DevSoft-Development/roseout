-- Search V3 Azure food/menu semantic foundation.
-- Applied Oregon first, then Virginia. Publication/subscription reconciliation is
-- intentionally handled by the protected dual-region migration workflow.

create table if not exists public.location_menu_items (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  item_name text not null,
  normalized_item_name text not null,
  source text not null,
  source_record_id uuid null,
  source_metadata jsonb not null default '{}'::jsonb,
  content_hash text not null,
  status text not null default 'active'
    check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, normalized_item_name, source)
);

create index if not exists location_menu_items_location_idx
  on public.location_menu_items(location_id, status);

alter table public.location_menu_items enable row level security;
revoke all on public.location_menu_items from anon, authenticated;
grant select, insert, update, delete on public.location_menu_items to service_role;

create table if not exists public.location_food_embeddings (
  location_id uuid not null references public.locations(id) on delete cascade,
  embedding_version text not null,
  embedding_provider text not null default 'azure'
    check (embedding_provider = 'azure'),
  embedding_model text not null,
  document_text text not null,
  document_hash text not null,
  embedding vector(1536),
  status text not null default 'pending'
    check (status in ('pending','ready','failed','stale')),
  calculated_at timestamptz null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (location_id, embedding_version)
);

create index if not exists location_food_embeddings_filter_idx
  on public.location_food_embeddings(embedding_version, status);

create index if not exists location_food_embeddings_hnsw_idx
  on public.location_food_embeddings
  using hnsw (embedding vector_cosine_ops);

alter table public.location_food_embeddings enable row level security;
revoke all on public.location_food_embeddings from anon, authenticated;
grant select, insert, update, delete on public.location_food_embeddings to service_role;

create table if not exists public.location_menu_item_embeddings (
  menu_item_id uuid not null references public.location_menu_items(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  embedding_version text not null,
  embedding_provider text not null default 'azure'
    check (embedding_provider = 'azure'),
  embedding_model text not null,
  document_hash text not null,
  embedding vector(1536),
  status text not null default 'pending'
    check (status in ('pending','ready','failed','stale')),
  calculated_at timestamptz null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (menu_item_id, embedding_version)
);

create index if not exists location_menu_item_embeddings_location_idx
  on public.location_menu_item_embeddings(location_id, embedding_version, status);

create index if not exists location_menu_item_embeddings_hnsw_idx
  on public.location_menu_item_embeddings
  using hnsw (embedding vector_cosine_ops);

alter table public.location_menu_item_embeddings enable row level security;
revoke all on public.location_menu_item_embeddings from anon, authenticated;
grant select, insert, update, delete on public.location_menu_item_embeddings to service_role;

create or replace function public.match_location_food_embeddings(
  p_query_embedding vector(1536),
  p_market_key text default null,
  p_match_count integer default 100,
  p_min_similarity numeric default 0.55,
  p_embedding_version text default 'azure-text-embedding-3-small:v1'
)
returns table(location_id uuid, similarity numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.location_id,
    (1 - (e.embedding <=> p_query_embedding))::numeric as similarity
  from public.location_food_embeddings e
  join public.locations l on l.id = e.location_id
  left join public.location_search_profiles p on p.location_id = e.location_id
  where e.status = 'ready'
    and e.embedding is not null
    and e.embedding_provider = 'azure'
    and e.embedding_version = p_embedding_version
    and (
      p_market_key is null
      or p_market_key = ''
      or lower(coalesce(p.market, l.market, l.source_market, '')) = lower(p_market_key)
    )
    and coalesce(l.is_searchable, true) = true
    and coalesce(l.is_hidden, false) = false
    and coalesce(l.active, true) = true
    and l.deleted_at is null
    and lower(coalesce(l.status, '')) not in (
      'closed','permanently_closed','archived','deleted','hidden'
    )
    and lower(coalesce(l.duplicate_status, '')) not in (
      'duplicate','secondary','merged'
    )
    and (1 - (e.embedding <=> p_query_embedding)) >= p_min_similarity
  order by e.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 100), 250));
$$;

revoke all on function public.match_location_food_embeddings(
  vector, text, integer, numeric, text
) from public, anon, authenticated;
grant execute on function public.match_location_food_embeddings(
  vector, text, integer, numeric, text
) to service_role;

create or replace function public.match_location_menu_items(
  p_query_embedding vector(1536),
  p_market_key text default null,
  p_match_count integer default 100,
  p_min_similarity numeric default 0.55,
  p_embedding_version text default 'azure-text-embedding-3-small:v1'
)
returns table(location_id uuid, item_name text, source text, similarity numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.location_id,
    mi.item_name,
    mi.source,
    (1 - (e.embedding <=> p_query_embedding))::numeric as similarity
  from public.location_menu_item_embeddings e
  join public.location_menu_items mi on mi.id = e.menu_item_id
  join public.locations l on l.id = e.location_id
  left join public.location_search_profiles p on p.location_id = e.location_id
  where e.status = 'ready'
    and mi.status = 'active'
    and e.embedding is not null
    and e.embedding_provider = 'azure'
    and e.embedding_version = p_embedding_version
    and (
      p_market_key is null
      or p_market_key = ''
      or lower(coalesce(p.market, l.market, l.source_market, '')) = lower(p_market_key)
    )
    and coalesce(l.is_searchable, true) = true
    and coalesce(l.is_hidden, false) = false
    and coalesce(l.active, true) = true
    and l.deleted_at is null
    and lower(coalesce(l.status, '')) not in (
      'closed','permanently_closed','archived','deleted','hidden'
    )
    and lower(coalesce(l.duplicate_status, '')) not in (
      'duplicate','secondary','merged'
    )
    and (1 - (e.embedding <=> p_query_embedding)) >= p_min_similarity
  order by e.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 100), 250));
$$;

revoke all on function public.match_location_menu_items(
  vector, text, integer, numeric, text
) from public, anon, authenticated;
grant execute on function public.match_location_menu_items(
  vector, text, integer, numeric, text
) to service_role;
