create table if not exists public.mailing_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft','queued','printed','mailed','completed','cancelled')),
  planned_mail_date date,
  mailed_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mailing_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.mailing_batches(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','printed','mailed','scanned','claim_started','claimed','returned','cancelled')),
  claim_code text,
  business_name text not null,
  street_address text,
  city text,
  state text,
  zip_code text,
  mailed_at timestamptz,
  first_scan_at timestamptz,
  claim_started_at timestamptz,
  claimed_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, location_id)
);

create index if not exists mailing_batches_status_idx on public.mailing_batches(status);
create index if not exists mailing_batches_created_at_idx on public.mailing_batches(created_at desc);
create index if not exists mailing_batch_items_batch_idx on public.mailing_batch_items(batch_id);
create index if not exists mailing_batch_items_location_idx on public.mailing_batch_items(location_id);
create index if not exists mailing_batch_items_status_idx on public.mailing_batch_items(status);

create or replace function public.set_mailing_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_mailing_batches_updated_at on public.mailing_batches;
create trigger trg_mailing_batches_updated_at
before update on public.mailing_batches
for each row execute function public.set_mailing_updated_at();

drop trigger if exists trg_mailing_batch_items_updated_at on public.mailing_batch_items;
create trigger trg_mailing_batch_items_updated_at
before update on public.mailing_batch_items
for each row execute function public.set_mailing_updated_at();

alter table public.mailing_batches enable row level security;
alter table public.mailing_batch_items enable row level security;

grant select, insert, update, delete on public.mailing_batches to authenticated;
grant select, insert, update, delete on public.mailing_batch_items to authenticated;

create policy mailing_batches_admin_read
on public.mailing_batches
for select
to authenticated
using (public.current_admin_role() in ('superadmin','admin','manager','ambassador','reviewer','viewer'));

create policy mailing_batches_admin_write
on public.mailing_batches
for all
to authenticated
using (public.current_admin_role() in ('superadmin','admin','manager'))
with check (public.current_admin_role() in ('superadmin','admin','manager'));

create policy mailing_batch_items_admin_read
on public.mailing_batch_items
for select
to authenticated
using (public.current_admin_role() in ('superadmin','admin','manager','ambassador','reviewer','viewer'));

create policy mailing_batch_items_admin_write
on public.mailing_batch_items
for all
to authenticated
using (public.current_admin_role() in ('superadmin','admin','manager'))
with check (public.current_admin_role() in ('superadmin','admin','manager'));
