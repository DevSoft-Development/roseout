create or replace function private.classify_google_no_hours()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is null
     and coalesce(new.is_demo, false) = false
     and new.operating_hours is null
     and new.google_place_id is not null
     and coalesce(new.gap_repair_google_calls, 0) > coalesce(old.gap_repair_google_calls, 0)
     and new.gap_repair_status = 'checked'
     and new.google_regular_opening_hours is null
     and new.google_current_opening_hours is null
  then
    new.hours_backfill_status := 'google_no_hours';
    new.hours_source := 'google_places_no_hours';
    new.hours_last_backfilled_at := coalesce(new.gap_repair_last_checked_at, now());
  end if;
  return new;
end;
$$;

revoke all on function private.classify_google_no_hours() from public, anon, authenticated;

drop trigger if exists locations_classify_google_no_hours on public.locations;
create trigger locations_classify_google_no_hours
before update of gap_repair_google_calls, gap_repair_status, operating_hours, google_regular_opening_hours, google_current_opening_hours
on public.locations
for each row
execute function private.classify_google_no_hours();

update public.locations
set hours_backfill_status = 'google_no_hours',
    hours_source = 'google_places_no_hours',
    hours_last_backfilled_at = coalesce(gap_repair_last_checked_at, now())
where deleted_at is null
  and coalesce(is_demo, false) = false
  and coalesce(active, true) = true
  and operating_hours is null
  and google_place_id is not null
  and coalesce(gap_repair_google_calls, 0) > 0
  and google_regular_opening_hours is null
  and google_current_opening_hours is null
  and gap_repair_status = 'checked';