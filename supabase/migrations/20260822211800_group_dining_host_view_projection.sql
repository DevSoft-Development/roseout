alter table public.location_reservations
  add column if not exists experience_booking_id uuid references public.experience_bookings(id) on delete cascade;
create unique index if not exists location_reservations_experience_booking_uidx on public.location_reservations(experience_booking_id) where experience_booking_id is not null;

create or replace function public.sync_group_dining_booking_to_host_view()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  exp_row public.experiences%rowtype;
  slot_row public.experience_slots%rowtype;
  host_status text;
begin
  select * into exp_row from public.experiences where id = new.experience_id;
  if not found or exp_row.experience_type <> 'group_dining' or exp_row.location_id is null then
    return new;
  end if;

  select * into slot_row from public.experience_slots where id = new.slot_id;
  if not found then return new; end if;

  host_status := case new.status
    when 'pending_payment' then 'pending'
    when 'confirmed' then 'confirmed'
    when 'completed' then 'completed'
    when 'cancelled' then 'cancelled'
    when 'no_show' then 'no_show'
    else 'confirmed'
  end;

  if new.status = 'pending_payment' then
    delete from public.location_reservations where experience_booking_id = new.id;
    return new;
  end if;

  insert into public.location_reservations (
    location_id, location_type, bookable_item_id, bookable_item_name, bookable_item_type,
    customer_name, customer_email, customer_phone, reservation_date, reservation_time,
    party_size, status, source, special_request, special_requests, duration_minutes,
    checked_in_at, completed_at, cancelled_at, updated_at, experience_booking_id
  ) values (
    exp_row.location_id, 'location', exp_row.id, exp_row.title, 'experience',
    new.customer_name, new.customer_email, new.customer_phone,
    (slot_row.starts_at at time zone 'America/New_York')::date,
    (slot_row.starts_at at time zone 'America/New_York')::time,
    new.party_size, host_status, 'experience_prepaid',
    'Prepaid Group Dining Experience', 'Prepaid Group Dining Experience', exp_row.duration_minutes,
    new.checked_in_at, case when new.status='completed' then coalesce(new.checked_in_at, now()) else null end,
    case when new.status='cancelled' then now() else null end, now(), new.id
  )
  on conflict (experience_booking_id) where experience_booking_id is not null do update set
    customer_name = excluded.customer_name,
    customer_email = excluded.customer_email,
    customer_phone = excluded.customer_phone,
    reservation_date = excluded.reservation_date,
    reservation_time = excluded.reservation_time,
    party_size = excluded.party_size,
    status = excluded.status,
    bookable_item_name = excluded.bookable_item_name,
    duration_minutes = excluded.duration_minutes,
    checked_in_at = excluded.checked_in_at,
    completed_at = excluded.completed_at,
    cancelled_at = excluded.cancelled_at,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sync_group_dining_booking_to_host_view on public.experience_bookings;
create trigger trg_sync_group_dining_booking_to_host_view
after insert or update of status, party_size, customer_name, customer_email, customer_phone, checked_in_at
on public.experience_bookings
for each row execute function public.sync_group_dining_booking_to_host_view();

revoke all on function public.sync_group_dining_booking_to_host_view() from public;
