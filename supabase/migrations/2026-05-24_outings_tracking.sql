create extension if not exists pgcrypto;

create table if not exists public.outings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  location_id uuid null,
  location_type text null,
  status text not null default 'planned',
  reservation_type text not null default 'external',
  external_reservation_url text null,
  phone_number text null,
  contact_method text null,
  reservation_clicked_at timestamptz null,
  call_clicked_at timestamptz null,
  completed_at timestamptz null,
  cancelled_at timestamptz null,
  rating int null,
  matched_vibe boolean null,
  would_go_again boolean null,
  feedback text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outings_status_check check (status in ('planned', 'reservation_clicked', 'call_clicked', 'completed', 'cancelled'))
);

alter table public.outings
  add column if not exists source_location_id text null,
  add column if not exists source text null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists outings_user_id_idx on public.outings (user_id);
create index if not exists outings_location_id_idx on public.outings (location_id);
create index if not exists outings_status_idx on public.outings (status);
create index if not exists outings_created_at_idx on public.outings (created_at desc);
create index if not exists outings_source_location_id_idx on public.outings (source_location_id);
