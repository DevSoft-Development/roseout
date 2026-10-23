create table if not exists public.trust_incidents (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('search','personalization','sponsorship','business_data','reviews','support_ai','model_provider','other')),
  severity text not null default 'warning' check (severity in ('info','warning','error','critical')),
  status text not null default 'open' check (status in ('open','investigating','resolved','dismissed')),
  title text not null check (char_length(trim(title)) between 3 and 180),
  summary text,
  request_id text,
  surface text,
  provider text,
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trust_incidents enable row level security;
revoke all on table public.trust_incidents from public, anon, authenticated;
grant all on table public.trust_incidents to service_role;

create index if not exists trust_incidents_status_created_idx
  on public.trust_incidents(status, created_at desc);
create index if not exists trust_incidents_severity_created_idx
  on public.trust_incidents(severity, created_at desc);
create index if not exists trust_incidents_request_id_idx
  on public.trust_incidents(request_id)
  where request_id is not null;
