-- Universal Location Catalog V1
-- Evolves existing location commerce/menu records into the shared source of truth
-- for Website, Profile, ThePOSHaven, Reserve, and future ordering channels.
--
-- Existing menu editors continue to write location_commerce_items unchanged.
-- Defaults make existing items immediately compatible with Website/Profile/POS.

begin;

alter table public.location_commerce_pages
  add column if not exists catalog_revision bigint not null default 1,
  add column if not exists published_revision bigint,
  add column if not exists published_at timestamptz;

alter table public.location_commerce_items
  add column if not exists item_type text not null default 'food_beverage',
  add column if not exists pos_short_name text,
  add column if not exists sku text,
  add column if not exists tax_category text,
  add column if not exists revenue_category text,
  add column if not exists prep_station text,
  add column if not exists duration_minutes integer,
  add column if not exists capacity integer,
  add column if not exists resource_type text,
  add column if not exists requires_booking boolean not null default false,
  add column if not exists requires_waiver boolean not null default false,
  add column if not exists minimum_age integer,
  add column if not exists deposit_cents integer,
  add column if not exists channel_visibility jsonb not null default
    '{"website":true,"profile":true,"pos":true,"reserve":false,"online_ordering":false,"qr_ordering":false,"kiosk":false}'::jsonb,
  add column if not exists fulfillment_metadata jsonb not null default '{}'::jsonb,
  add column if not exists booking_metadata jsonb not null default '{}'::jsonb;

alter table public.location_commerce_items
  drop constraint if exists location_commerce_items_item_type_check,
  add constraint location_commerce_items_item_type_check
    check (item_type in (
      'food_beverage',
      'retail',
      'service',
      'timed_resource',
      'admission_experience',
      'rental',
      'package_bundle',
      'fee_deposit'
    )),
  drop constraint if exists location_commerce_items_duration_minutes_check,
  add constraint location_commerce_items_duration_minutes_check
    check (duration_minutes is null or duration_minutes > 0),
  drop constraint if exists location_commerce_items_capacity_check,
  add constraint location_commerce_items_capacity_check
    check (capacity is null or capacity > 0),
  drop constraint if exists location_commerce_items_minimum_age_check,
  add constraint location_commerce_items_minimum_age_check
    check (minimum_age is null or (minimum_age >= 0 and minimum_age <= 125)),
  drop constraint if exists location_commerce_items_deposit_cents_check,
  add constraint location_commerce_items_deposit_cents_check
    check (deposit_cents is null or deposit_cents >= 0),
  drop constraint if exists location_commerce_items_channel_visibility_object_check,
  add constraint location_commerce_items_channel_visibility_object_check
    check (jsonb_typeof(channel_visibility) = 'object');

create unique index if not exists location_commerce_items_location_sku_uidx
  on public.location_commerce_items(location_id, sku)
  where sku is not null and btrim(sku) <> '';

create index if not exists location_commerce_items_location_type_idx
  on public.location_commerce_items(location_id, item_type, is_available, sort_order);

create index if not exists location_commerce_items_pos_channel_idx
  on public.location_commerce_items(location_id, sort_order)
  where is_available = true and coalesce((channel_visibility->>'pos')::boolean, false) = true;

create table if not exists public.location_catalog_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  commerce_item_id uuid not null references public.location_commerce_items(id) on delete cascade,
  name text not null,
  is_required boolean not null default false,
  min_select integer not null default 0,
  max_select integer,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_select >= 0),
  check (max_select is null or max_select >= min_select)
);

create table if not exists public.location_catalog_modifiers (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  modifier_group_id uuid not null references public.location_catalog_modifier_groups(id) on delete cascade,
  name text not null,
  price_delta_cents integer not null default 0,
  sku text,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.location_catalog_channel_overrides (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  commerce_item_id uuid not null references public.location_commerce_items(id) on delete cascade,
  channel text not null,
  is_enabled boolean not null default true,
  display_name text,
  description text,
  price_cents integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(commerce_item_id, channel),
  check (channel in ('website','profile','pos','reserve','online_ordering','qr_ordering','kiosk')),
  check (price_cents is null or price_cents >= 0)
);

create index if not exists location_catalog_modifier_groups_item_idx
  on public.location_catalog_modifier_groups(commerce_item_id, is_active, sort_order);
create index if not exists location_catalog_modifiers_group_idx
  on public.location_catalog_modifiers(modifier_group_id, is_available, sort_order);
create index if not exists location_catalog_channel_overrides_item_idx
  on public.location_catalog_channel_overrides(commerce_item_id, channel);

alter table public.location_catalog_modifier_groups enable row level security;
alter table public.location_catalog_modifiers enable row level security;
alter table public.location_catalog_channel_overrides enable row level security;

revoke all on table public.location_catalog_modifier_groups from public, anon, authenticated;
revoke all on table public.location_catalog_modifiers from public, anon, authenticated;
revoke all on table public.location_catalog_channel_overrides from public, anon, authenticated;

grant select, insert, update, delete on table public.location_catalog_modifier_groups to service_role;
grant select, insert, update, delete on table public.location_catalog_modifiers to service_role;
grant select, insert, update, delete on table public.location_catalog_channel_overrides to service_role;

comment on column public.location_commerce_items.item_type is
  'Universal catalog item type shared by Website, Profile, POS, Reserve, and ordering channels.';
comment on column public.location_commerce_items.channel_visibility is
  'Default per-channel visibility. Explicit rows in location_catalog_channel_overrides take precedence.';
comment on table public.location_catalog_modifier_groups is
  'Reusable modifier-group definitions attached to universal catalog items.';
comment on table public.location_catalog_channel_overrides is
  'Channel-specific presentation or price overrides without duplicating the master catalog item.';

commit;
