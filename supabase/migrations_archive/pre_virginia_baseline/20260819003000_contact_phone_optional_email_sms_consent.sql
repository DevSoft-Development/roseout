-- Allow contact-form support tickets to use email, mobile, or both.
-- Also retain an audit timestamp/source when SMS consent is explicitly granted.

alter table public.support_tickets
  alter column requester_email drop not null;

alter table public.support_tickets
  add column if not exists sms_consent_at timestamptz,
  add column if not exists sms_consent_source text;

-- A support ticket must retain at least one way to contact the requester.
alter table public.support_tickets
  drop constraint if exists support_tickets_requester_contact_check;

alter table public.support_tickets
  add constraint support_tickets_requester_contact_check
  check (
    nullif(btrim(coalesce(requester_email, '')), '') is not null
    or nullif(btrim(coalesce(requester_phone, '')), '') is not null
  );

create index if not exists support_tickets_requester_phone_idx
  on public.support_tickets (requester_phone)
  where requester_phone is not null;
