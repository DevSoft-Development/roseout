create table if not exists public.ai_trust_incidents (
  id uuid primary key default gen_random_uuid(),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','investigating','resolved')),
  surface text not null,
  summary text not null,
  request_id text,
  provider text,
  model text,
  owner_user_id uuid references auth.users(id) on delete set null,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_trust_incidents enable row level security;

create index if not exists idx_ai_trust_incidents_status_created
  on public.ai_trust_incidents(status, created_at desc);
create index if not exists idx_ai_trust_incidents_severity_created
  on public.ai_trust_incidents(severity, created_at desc);

comment on table public.ai_trust_incidents is
  'Internal trust incident register for AI-assisted search, personalization, sponsored disclosure, generated content, and model/provider incidents.';
