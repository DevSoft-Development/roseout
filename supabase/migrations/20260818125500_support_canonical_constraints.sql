-- Align support ticket CHECK constraints with the canonical workflow used by
-- user, location, employee, CRM, and admin support surfaces.

alter table public.support_tickets
  drop constraint if exists support_tickets_status_check;

alter table public.support_tickets
  add constraint support_tickets_status_check
  check (status = any (array[
    'new'::text,
    'open'::text,
    'pending'::text,
    'waiting_on_customer'::text,
    'waiting_on_internal'::text,
    'escalated'::text,
    'resolved'::text,
    'closed'::text,
    'reopened'::text
  ]));

alter table public.support_tickets
  drop constraint if exists support_tickets_requester_type_check;

alter table public.support_tickets
  add constraint support_tickets_requester_type_check
  check (requester_type = any (array[
    'user'::text,
    'location'::text,
    'employee'::text,
    'admin'::text,
    'system'::text
  ]));
