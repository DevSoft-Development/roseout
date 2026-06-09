alter table public.locations
  add column if not exists google_place_id text,
  add column if not exists google_enrichment_status text default 'pending',
  add column if not exists google_enriched_at timestamptz,
  add column if not exists google_primary_type text,
  add column if not exists google_types text[],
  add column if not exists google_maps_uri text,
  add column if not exists google_website_uri text,
  add column if not exists google_rating numeric,
  add column if not exists google_user_rating_count integer,
  add column if not exists google_last_error text;

alter table public.restaurants
  add column if not exists google_place_id text,
  add column if not exists google_enrichment_status text default 'pending',
  add column if not exists google_enriched_at timestamptz,
  add column if not exists google_primary_type text,
  add column if not exists google_types text[],
  add column if not exists google_maps_uri text,
  add column if not exists google_website_uri text,
  add column if not exists google_rating numeric,
  add column if not exists google_user_rating_count integer,
  add column if not exists google_last_error text;

alter table public.activities
  add column if not exists google_place_id text,
  add column if not exists google_enrichment_status text default 'pending',
  add column if not exists google_enriched_at timestamptz,
  add column if not exists google_primary_type text,
  add column if not exists google_types text[],
  add column if not exists google_maps_uri text,
  add column if not exists google_website_uri text,
  add column if not exists google_rating numeric,
  add column if not exists google_user_rating_count integer,
  add column if not exists google_last_error text;

create table if not exists public.location_google_food_term_suggestions (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id uuid not null,
  google_place_id text,
  location_name text,
  google_display_name text,
  match_confidence numeric default 0,
  suggested_food_terms text[] default '{}',
  suggested_cuisine_terms text[] default '{}',
  suggested_category_terms text[] default '{}',
  suggested_feature_terms text[] default '{}',
  suggested_search_keywords text[] default '{}',
  suggested_semantic_tags text[] default '{}',
  suggested_intent_tags text[] default '{}',
  google_types text[] default '{}',
  google_primary_type text,
  evidence jsonb default '{}'::jsonb,
  status text default 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_google_food_suggestions_source
on public.location_google_food_term_suggestions(source_table, source_id);

create index if not exists idx_google_food_suggestions_status
on public.location_google_food_term_suggestions(status, created_at);
