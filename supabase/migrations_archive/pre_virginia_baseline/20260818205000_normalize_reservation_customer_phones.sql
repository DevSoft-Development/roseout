create or replace function public.normalize_reservation_customer_phone()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  digits text;
begin
  if new.customer_phone is null or btrim(new.customer_phone) = '' then
    return new;
  end if;

  digits := regexp_replace(new.customer_phone, '\D', '', 'g');

  if length(digits) = 10 then
    new.customer_phone := '+1' || digits;
  elsif length(digits) = 11 and left(digits, 1) = '1' then
    new.customer_phone := '+' || digits;
  else
    new.customer_phone := btrim(new.customer_phone);
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_reservation_customer_phone_before_write on public.location_reservations;
create trigger normalize_reservation_customer_phone_before_write
before insert or update of customer_phone on public.location_reservations
for each row
execute function public.normalize_reservation_customer_phone();

update public.location_reservations
set customer_phone = case
  when length(regexp_replace(customer_phone, '\D', '', 'g')) = 10
    then '+1' || regexp_replace(customer_phone, '\D', '', 'g')
  when length(regexp_replace(customer_phone, '\D', '', 'g')) = 11
    and left(regexp_replace(customer_phone, '\D', '', 'g'), 1) = '1'
    then '+' || regexp_replace(customer_phone, '\D', '', 'g')
  else customer_phone
end
where customer_phone is not null
  and (
    length(regexp_replace(customer_phone, '\D', '', 'g')) = 10
    or (
      length(regexp_replace(customer_phone, '\D', '', 'g')) = 11
      and left(regexp_replace(customer_phone, '\D', '', 'g'), 1) = '1'
    )
  );
