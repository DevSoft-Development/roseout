-- Marketing operations E2E additions.
-- Live project was upgraded through the same idempotent statements before this
-- migration was committed so branch previews and future environments stay in sync.

alter table public.marketing_content_items
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists selected_platforms text[] not null default '{}',
  add column if not exists media_urls text[] not null default '{}',
  add column if not exists caption text,
  add column if not exists platform_copy jsonb not null default '{}'::jsonb,
  add column if not exists auto_publish boolean not null default false,
  add column if not exists approval_hash text,
  add column if not exists last_submitted_at timestamptz;

alter table public.marketing_content_items
  drop constraint if exists marketing_content_items_status_check;
alter table public.marketing_content_items
  add constraint marketing_content_items_status_check
  check (status in (
    'idea','draft','production','ready_for_review','changes_requested',
    'approved','scheduled','publishing','published','analyzed','failed','archived'
  ));

alter table public.social_posts
  drop constraint if exists social_posts_platform_check;
alter table public.social_posts
  add constraint social_posts_platform_check
  check (platform in ('instagram','facebook','tiktok','youtube','youtube_shorts'));

create table if not exists public.marketing_social_connection_secrets (
  connection_id uuid primary key references public.marketing_social_connections(id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  token_type text,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.marketing_social_connection_secrets enable row level security;
revoke all on public.marketing_social_connection_secrets from anon, authenticated;

create table if not exists public.marketing_content_asset_links (
  content_item_id uuid not null references public.marketing_content_items(id) on delete cascade,
  asset_id uuid not null references public.marketing_assets(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key(content_item_id, asset_id)
);
alter table public.marketing_content_asset_links enable row level security;
revoke all on public.marketing_content_asset_links from anon, authenticated;

create table if not exists public.marketing_content_opportunities (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('location','event','experience','offer','outing')),
  source_id uuid not null,
  location_id uuid references public.locations(id) on delete cascade,
  title text not null,
  description text,
  image_url text,
  status text not null default 'new' check (status in ('new','saved','featured','dismissed')),
  featured_content_item_id uuid references public.marketing_content_items(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_type, source_id)
);
alter table public.marketing_content_opportunities enable row level security;
revoke all on public.marketing_content_opportunities from anon, authenticated;
create index if not exists marketing_content_opportunities_status_idx
  on public.marketing_content_opportunities(status, discovered_at desc);
create index if not exists marketing_content_opportunities_location_idx
  on public.marketing_content_opportunities(location_id, discovered_at desc);

create table if not exists public.marketing_attribution_events (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid references public.marketing_content_items(id) on delete set null,
  social_post_id uuid references public.social_posts(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  event_type text not null,
  user_id uuid,
  anonymous_id text,
  session_id text,
  source text,
  medium text,
  campaign text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
alter table public.marketing_attribution_events enable row level security;
revoke all on public.marketing_attribution_events from anon, authenticated;
create index if not exists marketing_attribution_events_content_idx
  on public.marketing_attribution_events(content_item_id, occurred_at desc);
create index if not exists marketing_attribution_events_type_idx
  on public.marketing_attribution_events(event_type, occurred_at desc);

create unique index if not exists marketing_approvals_pending_version_idx
  on public.marketing_approvals(content_item_id, version)
  where status = 'pending';
create unique index if not exists social_publish_jobs_active_post_idx
  on public.social_publish_jobs(social_post_id)
  where status in ('queued','publishing','retrying');

insert into public.marketing_settings(key,value)
values
  ('social_publishing_global_pause','false'::jsonb),
  ('social_publishing_pause_instagram','false'::jsonb),
  ('social_publishing_pause_facebook','false'::jsonb),
  ('social_publishing_pause_tiktok','false'::jsonb),
  ('social_publishing_pause_youtube','false'::jsonb)
on conflict (key) do nothing;
