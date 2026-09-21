-- Read-only, guest-safe lobby TV displays for TheOutHaven Reserve.
create extension if not exists pgcrypto;

create table if not exists public.reserve_lobby_displays (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  label text not null default 'Lobby TV',
  status text not null default 'active' check (status in ('active','revoked')),
  token_hash text null unique,
  pairing_code_hash text null unique,
  pairing_expires_at timestamptz null,
  paired_at timestamptz null,
  last_seen_at timestamptz null,
  privacy_mode text not null default 'initials' check (privacy_mode in ('initials','anonymous')),
  show_estimated_wait boolean not null default true,
  show_reservation_time boolean not null default true,
  show_waitlist_position boolean not null default true,
  ready_hold_minutes integer not null default 10 check (ready_hold_minutes between 1 and 60),
  promo_enabled boolean not null default false,
  promo_media_type text not null default 'image' check (promo_media_type in ('image','video')),
  promo_media_url text null,
  promo_headline text null,
  promo_body text null,
  promo_link_label text null,
  promo_link_url text null,
  created_by_user_id uuid null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reserve_lobby_displays_location_idx
  on public.reserve_lobby_displays(location_id, status, created_at desc);

alter table public.reserve_lobby_displays enable row level security;
revoke all on table public.reserve_lobby_displays from anon, authenticated;
grant select, insert, update, delete on table public.reserve_lobby_displays to service_role;
