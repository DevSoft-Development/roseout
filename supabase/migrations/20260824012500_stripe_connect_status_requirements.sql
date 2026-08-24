alter table public.locations
  add column if not exists stripe_connect_requires_action boolean not null default false,
  add column if not exists stripe_connect_currently_due_count integer not null default 0,
  add column if not exists stripe_connect_past_due_count integer not null default 0,
  add column if not exists stripe_connect_future_due_count integer not null default 0,
  add column if not exists stripe_connect_requirements_deadline timestamptz,
  add column if not exists stripe_connect_disabled_reason text,
  add column if not exists stripe_connect_status_details jsonb not null default '[]'::jsonb;

alter table public.organizations
  add column if not exists stripe_connect_requires_action boolean not null default false,
  add column if not exists stripe_connect_currently_due_count integer not null default 0,
  add column if not exists stripe_connect_past_due_count integer not null default 0,
  add column if not exists stripe_connect_future_due_count integer not null default 0,
  add column if not exists stripe_connect_requirements_deadline timestamptz,
  add column if not exists stripe_connect_disabled_reason text,
  add column if not exists stripe_connect_status_details jsonb not null default '[]'::jsonb;

alter table public.locations drop constraint if exists locations_stripe_connect_due_counts_check;
alter table public.locations add constraint locations_stripe_connect_due_counts_check check (
  stripe_connect_currently_due_count >= 0 and
  stripe_connect_past_due_count >= 0 and
  stripe_connect_future_due_count >= 0
);

alter table public.organizations drop constraint if exists organizations_stripe_connect_due_counts_check;
alter table public.organizations add constraint organizations_stripe_connect_due_counts_check check (
  stripe_connect_currently_due_count >= 0 and
  stripe_connect_past_due_count >= 0 and
  stripe_connect_future_due_count >= 0
);
