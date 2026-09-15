begin;

create table if not exists public.creator_partner_outings (
  id uuid primary key default gen_random_uuid(),
  creator_source_id uuid not null references public.gtm_creator_sources(id) on delete cascade,
  title text not null,
  subtitle text,
  search_query text,
  primary_location_id uuid references public.locations(id) on delete set null,
  secondary_location_id uuid references public.locations(id) on delete set null,
  image_url text,
  status text not null default 'draft' check (status in ('draft','published','archived','needs_review')),
  sort_order integer not null default 100,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_partner_outings_creator_idx
  on public.creator_partner_outings(creator_source_id, status, published_at desc);
create index if not exists creator_partner_outings_published_idx
  on public.creator_partner_outings(status, sort_order, published_at desc)
  where status = 'published';

alter table public.creator_partner_outings enable row level security;
revoke all on public.creator_partner_outings from anon, authenticated;

comment on table public.creator_partner_outings is 'Creator-curated outing ideas surfaced through creator profiles and Discover. Server routes enforce creator ownership and moderation.';

commit;
