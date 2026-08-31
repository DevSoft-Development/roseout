create or replace function public.apply_reservation_booking_confirmation_mode()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_mode text;
begin
  if coalesce(new.source, '') not in ('theouthaven', 'theouthaven_reschedule') then
    return new;
  end if;

  select coalesce(reservation_settings #>> '{booking,confirmationMode}', 'instant')
    into v_mode
  from public.locations
  where id = new.location_id;

  if v_mode = 'approval' then
    new.status := 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists location_reservations_apply_booking_confirmation_mode on public.location_reservations;
create trigger location_reservations_apply_booking_confirmation_mode
before insert on public.location_reservations
for each row
execute function public.apply_reservation_booking_confirmation_mode();
