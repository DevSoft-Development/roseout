create or replace function public.sync_active_mailing_items_from_location()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.mailing_batch_items
  set
    business_name = coalesce(
      nullif(btrim(coalesce(new.name, '')), ''),
      nullif(btrim(coalesce(new.restaurant_name, '')), ''),
      nullif(btrim(coalesce(new.activity_name, '')), ''),
      'TheOutHaven location'
    ),
    street_address = nullif(btrim(coalesce(new.address, '')), ''),
    city = nullif(btrim(coalesce(new.city, '')), ''),
    state = nullif(btrim(coalesce(new.state, '')), ''),
    zip_code = nullif(btrim(coalesce(new.zip_code, '')), ''),
    claim_code = nullif(btrim(coalesce(new.claim_code, '')), '')
  where location_id = new.id
    and status in ('queued', 'printed');

  return new;
end;
$$;

drop trigger if exists trg_sync_active_mailing_items_from_location on public.locations;
create trigger trg_sync_active_mailing_items_from_location
after update of name, restaurant_name, activity_name, address, city, state, zip_code, claim_code
on public.locations
for each row
when (
  old.name is distinct from new.name
  or old.restaurant_name is distinct from new.restaurant_name
  or old.activity_name is distinct from new.activity_name
  or old.address is distinct from new.address
  or old.city is distinct from new.city
  or old.state is distinct from new.state
  or old.zip_code is distinct from new.zip_code
  or old.claim_code is distinct from new.claim_code
)
execute function public.sync_active_mailing_items_from_location();

update public.mailing_batch_items mbi
set
  business_name = coalesce(
    nullif(btrim(coalesce(l.name, '')), ''),
    nullif(btrim(coalesce(l.restaurant_name, '')), ''),
    nullif(btrim(coalesce(l.activity_name, '')), ''),
    'TheOutHaven location'
  ),
  street_address = nullif(btrim(coalesce(l.address, '')), ''),
  city = nullif(btrim(coalesce(l.city, '')), ''),
  state = nullif(btrim(coalesce(l.state, '')), ''),
  zip_code = nullif(btrim(coalesce(l.zip_code, '')), ''),
  claim_code = nullif(btrim(coalesce(l.claim_code, '')), '')
from public.locations l
where mbi.location_id = l.id
  and mbi.status in ('queued', 'printed');
