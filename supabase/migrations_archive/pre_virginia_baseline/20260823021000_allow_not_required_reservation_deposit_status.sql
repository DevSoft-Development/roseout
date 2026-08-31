alter table public.location_reservations
  drop constraint if exists location_reservations_deposit_status_check;

alter table public.location_reservations
  add constraint location_reservations_deposit_status_check
  check (
    deposit_status is null
    or deposit_status = any (
      array[
        'pending'::text,
        'paid'::text,
        'refunded'::text,
        'failed'::text,
        'not_required'::text
      ]
    )
  );
