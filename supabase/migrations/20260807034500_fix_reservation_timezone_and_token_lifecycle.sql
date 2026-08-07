-- Keep reservation lifecycle timestamps anchored to America/New_York.
-- This protects every reservation writer, not only the public booking route.

create or replace function public.toh_reservation_start_at_ny(
  p_reservation_date date,
  p_reservation_time time without time zone
)
returns timestamptz
language sql
immutable
strict
set search_path = public
as $$
  select (p_reservation_date + p_reservation_time) at time zone 'America/New_York';
$$;

create or replace function public.toh_guard_reservation_token_expiry()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  reservation_start timestamptz;
  minimum_expiry timestamptz;
  lifecycle_expiry timestamptz;
begin
  if new.customer_token is null then
    return new;
  end if;

  reservation_start := public.toh_reservation_start_at_ny(new.reservation_date, new.reservation_time);
  minimum_expiry := now() + interval '72 hours';
  lifecycle_expiry := reservation_start + interval '24 hours';

  new.customer_token_expires_at := greatest(
    coalesce(new.customer_token_expires_at, '-infinity'::timestamptz),
    minimum_expiry,
    lifecycle_expiry
  );

  return new;
end;
$$;

drop trigger if exists toh_guard_reservation_token_expiry on public.location_reservations;
create trigger toh_guard_reservation_token_expiry
before insert or update of reservation_date, reservation_time, customer_token, customer_token_expires_at
on public.location_reservations
for each row
execute function public.toh_guard_reservation_token_expiry();

create or replace function public.toh_sync_reservation_reminders()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  reservation_start timestamptz;
  settings jsonb := '{}'::jsonb;
  reminders jsonb := '{}'::jsonb;
  email_enabled boolean := true;
  guest_24h_enabled boolean := true;
  guest_2h_enabled boolean := true;
  active_reservation boolean;
  has_email boolean;
  due_at timestamptz;
  row_status text;
  row_error text;
begin
  select coalesce(l.reservation_settings, '{}'::jsonb)
    into settings
  from public.locations l
  where l.id = new.location_id;

  reminders := coalesce(settings -> 'reminders', '{}'::jsonb);
  email_enabled := coalesce((reminders ->> 'email')::boolean, true);
  guest_24h_enabled := coalesce((reminders ->> 'guest24h')::boolean, true);
  guest_2h_enabled := coalesce((reminders ->> 'guest2h')::boolean, true);
  active_reservation := lower(coalesce(new.status, '')) not in ('cancelled', 'completed', 'no_show', 'declined');
  has_email := nullif(btrim(coalesce(new.customer_email, '')), '') is not null;
  reservation_start := public.toh_reservation_start_at_ny(new.reservation_date, new.reservation_time);

  -- 24-hour reminder. An occupying cancelled row prevents application code from
  -- recreating a reminder at an incorrect timezone-derived timestamp.
  due_at := reservation_start - interval '24 hours';
  row_status := 'scheduled';
  row_error := null;
  if not active_reservation then
    row_status := 'cancelled';
    row_error := 'Reservation is not active.';
  elsif not email_enabled then
    row_status := 'cancelled';
    row_error := 'Email reminders are disabled for this location.';
  elsif not guest_24h_enabled then
    row_status := 'cancelled';
    row_error := '24-hour reminders are disabled for this location.';
  elsif not has_email then
    row_status := 'cancelled';
    row_error := 'Reservation has no customer email.';
  elsif due_at <= now() then
    row_status := 'cancelled';
    row_error := '24-hour reminder window already passed.';
  end if;

  insert into public.reservation_reminders (
    reservation_id, location_id, reminder_type, scheduled_for, status, error_message, updated_at
  ) values (
    new.id, new.location_id, 'reminder_24h', due_at, row_status, row_error, now()
  )
  on conflict (reservation_id, reminder_type) do update
    set location_id = excluded.location_id,
        scheduled_for = excluded.scheduled_for,
        status = case
          when public.reservation_reminders.status = 'sent' then public.reservation_reminders.status
          else excluded.status
        end,
        error_message = case
          when public.reservation_reminders.status = 'sent' then public.reservation_reminders.error_message
          else excluded.error_message
        end,
        updated_at = now();

  -- 2-hour reminder.
  due_at := reservation_start - interval '2 hours';
  row_status := 'scheduled';
  row_error := null;
  if not active_reservation then
    row_status := 'cancelled';
    row_error := 'Reservation is not active.';
  elsif not email_enabled then
    row_status := 'cancelled';
    row_error := 'Email reminders are disabled for this location.';
  elsif not guest_2h_enabled then
    row_status := 'cancelled';
    row_error := '2-hour reminders are disabled for this location.';
  elsif not has_email then
    row_status := 'cancelled';
    row_error := 'Reservation has no customer email.';
  elsif due_at <= now() then
    row_status := 'cancelled';
    row_error := '2-hour reminder window already passed.';
  end if;

  insert into public.reservation_reminders (
    reservation_id, location_id, reminder_type, scheduled_for, status, error_message, updated_at
  ) values (
    new.id, new.location_id, 'reminder_2h', due_at, row_status, row_error, now()
  )
  on conflict (reservation_id, reminder_type) do update
    set location_id = excluded.location_id,
        scheduled_for = excluded.scheduled_for,
        status = case
          when public.reservation_reminders.status = 'sent' then public.reservation_reminders.status
          else excluded.status
        end,
        error_message = case
          when public.reservation_reminders.status = 'sent' then public.reservation_reminders.error_message
          else excluded.error_message
        end,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists toh_sync_reservation_reminders on public.location_reservations;
create trigger toh_sync_reservation_reminders
after insert or update of reservation_date, reservation_time, location_id, customer_email, status
on public.location_reservations
for each row
execute function public.toh_sync_reservation_reminders();

comment on function public.toh_reservation_start_at_ny(date, time without time zone)
is 'Converts a local reservation date/time to the corresponding America/New_York instant.';

comment on function public.toh_guard_reservation_token_expiry()
is 'Keeps customer management tokens valid for at least 72 hours and through 24 hours after the reservation.';

comment on function public.toh_sync_reservation_reminders()
is 'Maintains 24h and 2h reservation reminders from America/New_York reservation time.';
