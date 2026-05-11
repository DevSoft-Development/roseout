-- Optional schema support for the admin/dashboard support, claim-label, and reserve changes.
-- Run in Supabase SQL editor before using department routing and ticket assignment.

alter table if exists public.support_tickets
  add column if not exists department text,
  add column if not exists assigned_admin_email text;

create index if not exists support_tickets_department_idx
  on public.support_tickets (department);

create index if not exists support_tickets_assigned_admin_email_idx
  on public.support_tickets (assigned_admin_email);

create table if not exists public.support_department_routing (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  department text not null,
  admin_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists support_department_routing_category_idx
  on public.support_department_routing (lower(category));

insert into public.support_department_routing (category, department, admin_email, is_active)
values
  ('General Support', 'Guest Care', null, true),
  ('Account Help', 'Guest Care', null, true),
  ('Reservation Help', 'OutHaven Reserve', null, true),
  ('Location Claim', 'Partner Success', null, true),
  ('Partner Success', 'Partner Success', null, true),
  ('Billing', 'Billing', null, true),
  ('Technical Issue', 'Platform Operations', null, true),
  ('Listing Correction', 'Partner Success', null, true)
on conflict ((lower(category))) do nothing;
