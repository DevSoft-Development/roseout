create table if not exists public.ai_trust_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_type text not null,
  severity text not null default 'low' check (severity in ('low','medium','high','critical')),
  surface text,
  request_id text,
  provider text,
  model text,
  summary text not null,
  status text not null default 'open' check (status in ('open','investigating','resolved')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_trust_incidents enable row level security;
revoke all on table public.ai_trust_incidents from public, anon, authenticated;
grant all on table public.ai_trust_incidents to service_role;

create index if not exists ai_trust_incidents_status_created_idx
  on public.ai_trust_incidents (status, created_at desc);
