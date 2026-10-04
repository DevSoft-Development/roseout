-- Durable external review ingestion for Location Intelligence V2.
create table if not exists public.location_external_reviews (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  provider text not null,
  external_review_id text not null,
  published_at timestamptz,
  rating numeric(3,2),
  review_text text,
  author_name text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(provider, external_review_id)
);

create index if not exists location_external_reviews_location_idx
  on public.location_external_reviews(location_id, published_at desc);

alter table public.location_external_reviews enable row level security;
revoke all on table public.location_external_reviews from public, anon, authenticated;
grant select,insert,update,delete on table public.location_external_reviews to service_role;

comment on table public.location_external_reviews is
  'Deduplicated external review records used for incremental Location Intelligence review ingestion.';
