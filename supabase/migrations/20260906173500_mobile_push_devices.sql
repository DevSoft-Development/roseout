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

create table if not exists public.mobile_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_outing_id uuid not null references public.user_outings(id) on delete cascade,
  device_id uuid not null references public.mobile_push_devices(id) on delete cascade,
  reminder_kind text not null check (reminder_kind in ('two_hour','thirty_minute','post_visit')),
  status text not null default 'sent',
  provider_message_id text,
  last_error text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_outing_id, device_id, reminder_kind)
);

create index if not exists mobile_push_deliveries_user_outing_idx
  on public.mobile_push_deliveries (user_id, user_outing_id, created_at desc);

alter table public.mobile_push_devices enable row level security;
alter table public.mobile_push_deliveries enable row level security;
revoke all on table public.mobile_push_devices from public, anon, authenticated;
revoke all on table public.mobile_push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.mobile_push_devices to service_role;
grant select, insert, update, delete on table public.mobile_push_deliveries to service_role;

comment on table public.mobile_push_devices is 'Server-managed Expo push tokens for authenticated TheOutHaven consumer devices.';
comment on table public.mobile_push_deliveries is 'Server-managed dedupe and delivery ledger for consumer mobile push notifications.';
