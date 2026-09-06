create table if not exists public.mobile_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('ios','android')),
  device_name text,
  app_version text,
  notifications_enabled boolean not null default true,
  transactional_enabled boolean not null default true,
  marketing_enabled boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expo_push_token)
);

create index if not exists mobile_push_devices_user_enabled_idx
  on public.mobile_push_devices (user_id, notifications_enabled)
  where notifications_enabled = true;

alter table public.mobile_push_devices enable row level security;
revoke all on table public.mobile_push_devices from public, anon, authenticated;
grant select, insert, update, delete on table public.mobile_push_devices to service_role;

comment on table public.mobile_push_devices is 'Server-managed Expo push tokens for authenticated TheOutHaven consumer devices.';
