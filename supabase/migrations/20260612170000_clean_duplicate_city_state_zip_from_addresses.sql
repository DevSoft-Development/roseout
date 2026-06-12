create or replace function public.toh_strip_city_state_zip_from_address(
  input_address text,
  input_city text,
  input_state text,
  input_zip text
)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text;
  suffix text;
begin
  cleaned := btrim(coalesce(input_address, ''));

  if cleaned = '' then
    return cleaned;
  end if;

  suffix := concat_ws(
    '\s*,?\s*',
    nullif(regexp_replace(coalesce(input_city, ''), '([\\.^$|()\\[\\]{}*+?])', '\\\1', 'g'), ''),
    nullif(regexp_replace(coalesce(input_state, ''), '([\\.^$|()\\[\\]{}*+?])', '\\\1', 'g'), ''),
    nullif(regexp_replace(coalesce(input_zip, ''), '([\\.^$|()\\[\\]{}*+?])', '\\\1', 'g'), '')
  );

  if suffix <> '' then
    cleaned := regexp_replace(cleaned, '\s*,?\s*' || suffix || '\s*$', '', 'i');
  end if;

  if coalesce(input_zip, '') <> '' then
    cleaned := regexp_replace(cleaned, '\s*,?\s*' || regexp_replace(input_zip, '([\\.^$|()\\[\\]{}*+?])', '\\\1', 'g') || '\s*$', '', 'i');
  end if;

  if coalesce(input_state, '') <> '' then
    cleaned := regexp_replace(cleaned, '\s*,?\s*' || regexp_replace(input_state, '([\\.^$|()\\[\\]{}*+?])', '\\\1', 'g') || '\s*$', '', 'i');
  end if;

  if coalesce(input_city, '') <> '' then
    cleaned := regexp_replace(cleaned, '\s*,?\s*' || regexp_replace(input_city, '([\\.^$|()\\[\\]{}*+?])', '\\\1', 'g') || '\s*$', '', 'i');
  end if;

  cleaned := regexp_replace(cleaned, '\s*,\s*$', '', 'g');

  return btrim(cleaned);
end;
$$;

update public.restaurants
set address = public.toh_strip_city_state_zip_from_address(address, city, state, zip_code),
    updated_at = now()
where address is not null
  and (
    address ilike '%' || city || '%'
    or address ilike '%' || state || '%'
    or address ilike '%' || zip_code || '%'
  );

update public.activities
set address = public.toh_strip_city_state_zip_from_address(address, city, state, zip_code),
    updated_at = now()
where address is not null
  and (
    address ilike '%' || city || '%'
    or address ilike '%' || state || '%'
    or address ilike '%' || zip_code || '%'
  );

update public.locations
set address = public.toh_strip_city_state_zip_from_address(address, city, state, zip_code),
    updated_at = now()
where address is not null
  and (
    address ilike '%' || city || '%'
    or address ilike '%' || state || '%'
    or address ilike '%' || zip_code || '%'
  );

drop function if exists public.toh_strip_city_state_zip_from_address(text, text, text, text);
