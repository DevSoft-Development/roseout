create table if not exists public.location_websites (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null unique references public.locations(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','ready','published','paused','failed')),
  site_title text,
  theme jsonb not null default '{}'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  custom_content jsonb not null default '{}'::jsonb,
  hosting_provider text not null default 'lightsail' check (hosting_provider in ('lightsail')),
  hosting_node_id text,
  published_version integer,
  last_publish_status text not null default 'not_published' check (last_publish_status in ('not_published','queued','publishing','published','failed')),
  last_publish_error text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.location_website_versions (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.location_websites(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  source text not null default 'editor' check (source in ('editor','ai','publish','rollback')),
  created_by uuid,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (website_id, version)
);

create index if not exists idx_location_website_versions_website_created
  on public.location_website_versions (website_id, created_at desc);

alter table public.location_websites enable row level security;
alter table public.location_website_versions enable row level security;

revoke all on table public.location_websites from anon, authenticated;
revoke all on table public.location_website_versions from anon, authenticated;
grant all on table public.location_websites to service_role;
grant all on table public.location_website_versions to service_role;

comment on column public.location_websites.sections is 'Presentation structure only. Canonical location fields such as hours, address, phone, reservation links, and current photos remain live-bound to public.locations and related canonical tables.';
comment on column public.location_websites.custom_content is 'Website-specific editorial or AI-authored copy. Do not duplicate canonical business fields here.';
