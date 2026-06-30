create table if not exists public.location_team_members (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  user_id uuid null references auth.users(id) on delete cascade,
  email text not null,
  name text null,
  role text not null default 'view_only',
  permissions jsonb not null default '{}'::jsonb,
  invited_by uuid null,
  invitation_token text null,
  invitation_status text not null default 'pending',
  accepted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_team_members_role_check check (role in ('location_admin','manager','host','marketing','view_only'))
);
create index if not exists location_team_members_location_id_idx on public.location_team_members(location_id);
create index if not exists location_team_members_email_idx on public.location_team_members(email);
create index if not exists location_team_members_user_id_idx on public.location_team_members(user_id);
create unique index if not exists location_team_members_location_lower_email_uidx on public.location_team_members(location_id, lower(email));
alter table public.location_team_members enable row level security;
