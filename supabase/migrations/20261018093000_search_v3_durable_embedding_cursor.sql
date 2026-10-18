-- Durable keyset progress for Search V3 embedding maintenance.
create table if not exists public.search_maintenance_cursors (
  job_key text primary key,
  last_id uuid,
  updated_at timestamptz not null default now()
);
alter table public.search_maintenance_cursors enable row level security;
revoke all on public.search_maintenance_cursors from anon, authenticated;
grant select, insert, update on public.search_maintenance_cursors to service_role;
