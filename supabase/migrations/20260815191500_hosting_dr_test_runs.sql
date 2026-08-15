create table if not exists public.hosting_dr_test_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  mode text not null default 'simulation' check (mode in ('simulation')),
  status text not null check (status in ('pass', 'warn', 'fail')),
  source_node_id uuid null references public.website_hosting_nodes(id) on delete set null,
  target_node_id uuid null references public.website_hosting_nodes(id) on delete set null,
  site_count integer not null default 0,
  pass_count integer not null default 0,
  warn_count integer not null default 0,
  fail_count integer not null default 0,
  summary text not null,
  results jsonb not null default '[]'::jsonb
);

create index if not exists hosting_dr_test_runs_created_at_idx
  on public.hosting_dr_test_runs (created_at desc);

alter table public.hosting_dr_test_runs enable row level security;

comment on table public.hosting_dr_test_runs is
  'Non-destructive hosting disaster-recovery simulation results. Writes are performed only by the service role after admin authorization.';
