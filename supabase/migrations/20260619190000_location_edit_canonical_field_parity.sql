-- public.locations is the canonical source of truth for admin location edits.
-- Legacy public.restaurants and public.activities may be read for fallback context,
-- but the admin edit API must not write the full edit payload to those legacy tables.

alter table public.locations add column if not exists formatted_address text;
alter table public.locations add column if not exists days_of_operation jsonb;
alter table public.locations add column if not exists dress_code text;
alter table public.locations add column if not exists parking_info text;
alter table public.locations add column if not exists reservation_discovery_status text;
alter table public.locations add column if not exists reservation_manual_override boolean;
alter table public.locations add column if not exists reservation_provider text;
alter table public.locations add column if not exists reservation_url text;
alter table public.locations add column if not exists reservation_phone text;
alter table public.locations add column if not exists booking_url text;
alter table public.locations add column if not exists website_url text;
alter table public.locations add column if not exists phone text;
alter table public.locations add column if not exists description text;
alter table public.locations add column if not exists short_description text;
alter table public.locations add column if not exists neighborhood text;
alter table public.locations add column if not exists borough text;
alter table public.locations add column if not exists city text;
alter table public.locations add column if not exists state text;
alter table public.locations add column if not exists postal_code text;
alter table public.locations add column if not exists country text;
alter table public.locations add column if not exists latitude double precision;
alter table public.locations add column if not exists longitude double precision;
alter table public.locations add column if not exists price_level text;
alter table public.locations add column if not exists ambiance text;
alter table public.locations add column if not exists good_for text[];
alter table public.locations add column if not exists cuisine text;
alter table public.locations add column if not exists activity_type text;
alter table public.locations add column if not exists tags text[];
alter table public.locations add column if not exists is_searchable boolean;
alter table public.locations add column if not exists publish_ready boolean;
alter table public.locations add column if not exists data_status text;
alter table public.locations add column if not exists photo_status text;
alter table public.locations add column if not exists image_url text;
alter table public.locations add column if not exists main_image text;
alter table public.locations add column if not exists images text[];

comment on table public.locations is 'Canonical public location profile table. Admin edit API writes here only; legacy restaurants/activities are fallback read sources, not admin edit targets.';
comment on column public.locations.publish_ready is 'Launch/review flag used with is_searchable to determine public readiness.';
