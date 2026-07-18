create table if not exists public.search_result_impressions (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null,
  search_id text not null,
  session_id text not null,
  query_hash text null,
  location_id uuid null references public.locations(id) on delete set null,
  restaurant_location_id uuid null references public.locations(id) on delete set null,
  activity