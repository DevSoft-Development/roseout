-- Unified Demo Center safety metadata. Idempotent and scoped to demo records only.
alter table if exists public.locations add column if not exists is_demo boolean not null default false;
alter table if exists public.locations add column if not exists demo_key text;
alter table if exists public.locations add column if not exists demo_mode text;
alter table if exists public.locations add column if not exists demo_reset_at timestamptz;
alter table if exists public.locations add column if not exists demo_visible_publicly boolean not null default false;
alter table if exists public.locations add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table if exists public.reservations add column if not exists is_demo boolean not null default false;
alter table if exists public.reservations add column if not exists demo_key text;
alter table if exists public.reservations add column if not exists demo_mode text;
alter table if exists public.reservations add column if not exists demo_reset_at timestamptz;
alter table if exists public.reservations add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists locations_is_demo_idx on public.locations(is_demo);
create index if not exists locations_demo_key_idx on public.locations(demo_key);
create index if not exists locations_demo_mode_idx on public.locations(demo_mode);
create index if not exists reservations_is_demo_idx on public.reservations(is_demo);
create index if not exists reservations_demo_key_idx on public.reservations(demo_key);

update public.locations
set is_searchable = false,
    is_hidden = true,
    demo_visible_publicly = false
where is_demo is true or demo_key is not null;
