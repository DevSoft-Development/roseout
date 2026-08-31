alter table if exists public.locations
  add column if not exists plan text default 'free_discovery',
  add column if not exists plan_status text default 'inactive',
  add column if not exists subscription_plan text,
  add column if not exists subscription_status text,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists promo_code text,
  add column if not exists promo_campaign text,
  add column if not exists billing_notes text,
  add column if not exists is_pro boolean default false,
  add column if not exists main_image text,
  add column if not exists gallery_images jsonb default '[]'::jsonb,
  add column if not exists crm_priority text,
  add column if not exists follow_up_date date,
  add column if not exists outreach_status text default 'none',
  add column if not exists internal_notes text,
  add column if not exists active boolean default true,
  add column if not exists is_searchable boolean default true;

create table if not exists public.location_plan_change_logs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  previous_plan text,
  new_plan text,
  previous_status text,
  new_status text,
  trial_ends_at timestamptz,
  promo_code text,
  promo_campaign text,
  note text,
  actor_user_id uuid,
  actor_email text,
  created_at timestamptz not null default now()
);

create index if not exists location_plan_change_logs_location_idx
  on public.location_plan_change_logs(location_id, created_at desc);

create table if not exists public.location_photo_change_logs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  main_image text,
  gallery_count integer default 0,
  actor_user_id uuid,
  actor_email text,
  created_at timestamptz not null default now()
);

create index if not exists location_photo_change_logs_location_idx
  on public.location_photo_change_logs(location_id, created_at desc);
