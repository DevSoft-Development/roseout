create table if not exists public.reservation_sms_sessions (
  phone_e164 text primary key,
  reservation_id uuid references public.location_reservations(id) on delete cascade,
  state text not null,
  pending_action text,
  pending_data jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reservation_sms_sessions_expires_idx
  on public.reservation_sms_sessions (expires_at);

alter table public.reservation_sms_sessions enable row level security;

comment on table public.reservation_sms_sessions is
  'Short-lived server-side state for deterministic two-way reservation SMS actions. Service-role access only.';
