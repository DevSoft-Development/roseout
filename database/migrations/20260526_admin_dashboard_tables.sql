create table if not exists admin_communication_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_type text not null,
  category text,
  subject text,
  body text not null,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists claim_codes (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  code text not null unique,
  claim_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists claim_codes_location_id_idx on claim_codes(location_id);

create table if not exists subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  audience text not null,
  price_cents integer not null default 0,
  billing_interval text not null default 'monthly',
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  trial_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists plan_assignments (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id uuid not null,
  plan_id uuid references subscription_plans(id) on delete set null,
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  renews_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_assignments_subject_idx on plan_assignments(subject_type, subject_id);
create index if not exists plan_assignments_plan_id_idx on plan_assignments(plan_id);
