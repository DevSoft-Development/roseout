-- Search anchor platform for named landmarks, venues, malls, parks, beaches,
-- transit hubs, universities, hotels, and existing TheOutHaven locations.

create extension if not exists pg_trgm;

create table if not exists public.search_anchors (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text not null,
  aliases text[] not null default '{}',
  anchor_type text not null,
  source_type text not null default 'curated',
  city text,
  state text,
  borough text,
  neighborhood text,
  county text,
  market text,
  latitude double precision not null,
  longitude double precision not null,
  default_radius_miles numeric(6,2) not null default 1.50,