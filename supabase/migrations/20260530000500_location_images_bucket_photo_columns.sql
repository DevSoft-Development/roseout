alter table if exists public.locations
  add column if not exists main_image text,
  add column if not exists gallery_images jsonb default '[]'::jsonb;

create table if not exists public.location_photo_change_logs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references public.locations(id) on delete cascade,
  main_image text,
  gallery_count integer default 0,
  actor_user_id uuid,
  actor_email text,
  created_at timestamptz not null default now()
);

create index if not exists location_photo_change_logs_location_idx
  on public.location_photo_change_logs(location_id, created_at desc);
