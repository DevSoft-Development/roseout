alter table if exists public.locations
  add column if not exists reservation_embed_enabled boolean default false,
  add column if not exists reservation_layout jsonb default '{}'::jsonb,
  add column if not exists reservation_embed_settings jsonb default '{}'::jsonb,
  add column if not exists crm_status text,
  add column if not exists outreach_status text default 'none',
  add column if not exists crm_priority text default 'normal',
  add column if not exists follow_up_date date,
  add column if not exists internal_notes text,
  add column if not exists active boolean default true,
  add column if not exists is_searchable boolean default true,
  add column if not exists deleted_at timestamptz;

create table if not exists public.location_deletion_logs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid,
  location_name text,
  actor_user_id uuid,
  actor_email text,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists location_deletion_logs_created_idx
  on public.location_deletion_logs(created_at desc);
