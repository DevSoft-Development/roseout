alter table if exists public.reservation_waitlist
  alter column customer_phone drop not null;

alter table if exists public.reservation_waitlist
  alter column customer_name drop not null;

alter table if exists public.reservation_waitlist
  add column if not exists contact_name text;

alter table if exists public.reservation_waitlist
  add column if not exists contact_email text;

alter table if exists public.reservation_waitlist
  add column if not exists contact_phone text;

alter table if exists public.reservation_waitlist
  add column if not exists notes text;

alter table if exists public.reservation_waitlist
  add column if not exists converted_reservation_id uuid;

alter table if exists public.reservation_waitlist
  add column if not exists converted_at timestamptz;

update public.reservation_waitlist
set
  contact_name = coalesce(contact_name, customer_name),
  contact_phone = coalesce(contact_phone, customer_phone),
  contact_email = coalesce(contact_email, customer_email)
where contact_name is null
   or contact_phone is null
   or contact_email is null;

alter table if exists public.reservation_waitlist
  drop constraint if exists reservation_waitlist_contact_method_check;

alter table if exists public.reservation_waitlist
  add constraint reservation_waitlist_contact_method_check
  check (
    nullif(trim(coalesce(contact_phone, customer_phone, '')), '') is not null
    or nullif(trim(coalesce(contact_email, customer_email, '')), '') is not null
  );
