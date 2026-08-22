create extension if not exists btree_gist;

create table if not exists public.experience_table_blocks (
  id uuid primary key default gen_random_uuid(),
  experience_booking_id uuid not null references public.experience_bookings(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  slot_id uuid not null references public.experience_slots(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  layout_item_id uuid not null references public.layout_items(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'held' check (status in ('held','confirmed','released')),
  hold_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (experience_booking_id, layout_item_id)
);

create index if not exists experience_table_blocks_location_time_idx on public.experience_table_blocks(location_id, starts_at, ends_at);
create index if not exists experience_table_blocks_active_idx on public.experience_table_blocks(location_id, layout_item_id, starts_at, ends_at) where status in ('held','confirmed');

alter table public.experience_table_blocks enable row level security;
revoke all on public.experience_table_blocks from anon, authenticated;
