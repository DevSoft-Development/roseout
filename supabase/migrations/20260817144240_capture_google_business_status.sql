alter table public.locations
  add column if not exists google_business_status text,
  add column if not exists google_business_status_checked_at timestamptz;

comment on column public.locations.google_business_status is
  'Google Places businessStatus value: OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY, FUTURE_OPENING, or BUSINESS_STATUS_UNSPECIFIED.';

comment on column public.locations.google_business_status_checked_at is
  'Last time Google Places business status was checked.';

create or replace function public.oh_apply_google_business_status_visibility()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.google_business_status is distinct from old.google_business_status then
    new.google_business_status_checked_at := coalesce(new.google_business_status_checked_at, now());
  end if;

  if new.google_business_status = 'CLOSED_PERMANENTLY' then
    new.is_searchable := false;
    new.is_hidden := true;
    new.publish_ready := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_google_business_status_visibility on public.locations;
create trigger trg_apply_google_business_status_visibility
before update of google_business_status on public.locations
for each row execute function public.oh_apply_google_business_status_visibility();
