create table if not exists public.outing_external_bookings (
  id uuid primary key default gen_random_uuid(),
  outing_id uuid not null references public.outings(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  location_type text null,
  provider text null,
  status text not null default 'available' check (status in ('available','started','confirmed','failed','abandoned')),
  started_at timestamptz null,
  confirmed_at timestamptz null,
  confirmation_source text null,
  failed_at timestamptz null,
  failure_source text null,
  followup_phone text null,
  followup_sent_at timestamptz null,
  last_prompt_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outing_id, location_id)
);

alter table public.outing_external_bookings enable row level security;
revoke all on table public.outing_external_bookings from anon, authenticated;
grant all on table public.outing_external_bookings to service_role;

create index if not exists idx_outing_external_bookings_followup
  on public.outing_external_bookings(status, started_at)
  where status = 'started' and followup_sent_at is null;
create index if not exists idx_outing_external_bookings_phone
  on public.outing_external_bookings(followup_phone, followup_sent_at desc)
  where status = 'started' and followup_sent_at is not null;
create index if not exists idx_outing_external_bookings_outing
  on public.outing_external_bookings(outing_id, status, updated_at desc);
