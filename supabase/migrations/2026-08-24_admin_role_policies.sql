create table if not exists public.admin_role_policies (
  role text primary key,
  label text not null,
  description text not null,
  permissions jsonb not null default '[]'::jsonb,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_role_policies_permissions_array check (jsonb_typeof(permissions) = 'array')
);

alter table public.admin_role_policies enable row level security;
revoke all on table public.admin_role_policies from anon, authenticated;
grant all on table public.admin_role_policies to service_role;

create index if not exists admin_role_policies_updated_at_idx
  on public.admin_role_policies (updated_at desc);
