create schema if not exists private;

create table if not exists public.short_links (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  destination_url text not null,
  link_type text not null default 'generic',
  entity_type text,
  entity_id text,
  campaign_id uuid,
  title text,
  is_active boolean not null default true,
  expires_at timestamptz,
  max_clicks bigint,
  click_count bigint not null default 0,
  last_clicked_at timestamptz,
  created_by text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint short_links_code_format check (code ~ '^[A-Za-z0-9_-]{8,20}$'),
  constraint short_links_destination_nonempty check (length(btrim(destination_url)) > 0),
  constraint short_links_max_clicks_positive check (max_clicks is null or max_clicks > 0)
);

create index if not exists short_links_entity_idx on public.short_links (entity_type, entity_id);
create index if not exists short_links_campaign_idx on public.short_links (campaign_id) where campaign_id is not null;
create index if not exists short_links_active_idx on public.short_links (is_active, expires_at);
create index if not exists short_links_created_at_idx on public.short_links (created_at desc);

create table if not exists public.short_link_clicks (
  id uuid primary key default gen_random_uuid(),
  short_link_id uuid not null references public.short_links(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  referrer text,
  user_agent text,
  visitor_hash text,
  country text,
  region text,
  city text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists short_link_clicks_link_time_idx on public.short_link_clicks (short_link_id, clicked_at desc);
create index if not exists short_link_clicks_visitor_idx on public.short_link_clicks (short_link_id, visitor_hash) where visitor_hash is not null;
create index if not exists short_link_clicks_campaign_idx on public.short_link_clicks (utm_campaign, clicked_at desc) where utm_campaign is not null;

alter table public.short_links enable row level security;
alter table public.short_link_clicks enable row level security;

revoke all on table public.short_links from anon, authenticated;
revoke all on table public.short_link_clicks from anon, authenticated;

grant all on table public.short_links to service_role;
grant all on table public.short_link_clicks to service_role;

create or replace function private.short_link_click_rollup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.short_links
  set click_count = click_count + 1,
      last_clicked_at = new.clicked_at,
      updated_at = now()
  where id = new.short_link_id;
  return new;
end;
$$;

revoke all on function private.short_link_click_rollup() from public;

drop trigger if exists trg_short_link_click_rollup on public.short_link_clicks;
create trigger trg_short_link_click_rollup
after insert on public.short_link_clicks
for each row execute function private.short_link_click_rollup();
