alter table public.business_websites alter column domain drop not null, alter column hosting_node_id drop not null, alter column site_path drop not null;

alter table public.business_websites
  add column if not exists editor_status text not null default 'draft' check (editor_status in ('draft','ready','published','paused','failed')),
  add column if not exists site_title text,
  add column if not exists theme jsonb not null default '{}'::jsonb,
  add column if not exists sections jsonb not null default '[]'::jsonb,
  add column if not exists custom_content jsonb not null default '{}'::jsonb,
  add column if not exists published_version integer,
  add column if not exists last_publish_status text not null default 'not_published' check (last_publish_status in ('not_published','queued','publishing','published','failed')),
  add column if not exists published_at timestamptz;

create table if not exists public.business_website_versions (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.business_websites(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  source text not null default 'editor' check (source in ('editor','ai','publish','rollback')),
  created_by uuid,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (website_id, version)
);

create table if not exists public.business_website_ai_usage (
  id uuid primary key default gen_random_uuid(),
  website_id uuid references public.business_websites(id) on delete set null,
  location_id uuid not null references public.locations(id) on delete cascade,
  generation_type text not null,
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  provider text,
  model text,
  request_key text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_micros bigint not null default 0,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_business_website_versions_website_created on public.business_website_versions (website_id, created_at desc);
create index if not exists idx_business_website_ai_usage_location_created on public.business_website_ai_usage (location_id, created_at desc);
create index if not exists idx_business_website_ai_usage_website_created on public.business_website_ai_usage (website_id, created_at desc);

alter table public.business_website_versions enable row level security;
alter table public.business_website_ai_usage enable row level security;
revoke all on table public.business_website_versions from public, anon, authenticated;
revoke all on table public.business_website_ai_usage from public, anon, authenticated;
grant all on table public.business_website_versions to service_role;
grant all on table public.business_website_ai_usage to service_role;

comment on column public.business_websites.sections is 'Presentation structure for TheOutHaven-generated websites only.';
comment on column public.business_websites.custom_content is 'Website-specific editorial or AI-authored copy for TheOutHaven-generated websites.';
comment on table public.location_websites is 'Reserved for external/current websites associated with locations; TheOutHaven-generated websites live in public.business_websites.';
