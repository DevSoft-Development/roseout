create extension if not exists vector;

alter table public.locations
  add column if not exists semantic_search_text text,
  add column if not exists semantic_tags text[] default '{}',
  add column if not exists intent_tags text[] default '{}',
  add column if not exists quality_score numeric default 0,
  add column if not exists recommendation_score numeric default 0,
  add column if not exists popularity_score numeric default 0,
  add column if not exists analytics_score numeric default 0,
  add column if not exists semantic_embedding vector(1536),
  add column if not exists embedding_updated_at timestamptz,
  add column if not exists needs_semantic_refresh boolean default true;

create index if not exists locations_quality_score_semantic_idx
  on public.locations (quality_score);

create index if not exists locations_recommendation_score_idx
  on public.locations (recommendation_score);

create index if not exists locations_semantic_tags_gin_idx
  on public.locations using gin (semantic_tags);

create index if not exists locations_intent_tags_gin_idx
  on public.locations using gin (intent_tags);

create table if not exists public.location_analytics (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references public.locations(id) on delete cascade,
  views integer default 0,
  clicks integer default 0,
  saves integer default 0,
  bookings integer default 0,
  skips integer default 0,
  conversion_rate numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists location_analytics_location_id_idx
  on public.location_analytics (location_id);
