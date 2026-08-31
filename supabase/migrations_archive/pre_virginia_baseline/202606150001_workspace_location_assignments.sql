create table if not exists public.team_location_assignments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  team_member_id uuid not null references public.team_member_profiles(id) on delete cascade,
  assigned_by uuid null,
  assignment_type text not null default 'partner_launch',
  priority text not null default 'normal',
  status text not null default 'active',
  reason text null,
  notes text null,
  campaign text not null default 'partner_launch',
  next_action_type text null,
  next_action_note text null,
  next_action_due_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists team_location_assignments_unique_active on public.team_location_assignments(location_id, team_member_id, assignment_type) where status = 'active';
create index if not exists team_location_assignments_team_member_idx on public.team_location_assignments(team_member_id, status);
create index if not exists team_location_assignments_location_idx on public.team_location_assignments(location_id, status);

alter table public.ambassador_site_visits add column if not exists matched_location_id uuid null references public.locations(id) on delete set null;
alter table public.ambassador_site_visits add column if not exists matched_location_snapshot jsonb not null default '{}'::jsonb;
alter table public.ambassador_site_visits add column if not exists correction_requested boolean not null default false;
alter table public.ambassador_site_visits add column if not exists correction_notes text null;
