create or replace function public.toh_clean_street_address(
  p_address text,
  p_city text default null,
  p_state text default null,
  p_zip text default null
)
returns text
language plpgsql
immutable
as $$
declare
  v text := trim(coalesce(p_address, ''));
  c text := trim(coalesce(p_city, ''));
  s text := trim(coalesce(p_state, ''));
  z text := trim(coalesce(p_zip, ''));
begin
  if v = '' then
    return null;
  end if;

  if c <> '' and s <> '' and z <> '' then
    v := regexp_replace(v, ',?\s*' || regexp_replace(c, '([\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:\-])', '\\\1', 'g') || '\s*,\s*' || regexp_replace(s, '([\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:\-])', '\\\1', 'g') || '\s*,?\s*' || regexp_replace(z, '([\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:\-])', '\\\1', 'g') || '\s*$', '', 'i');
  end if;

  if c <> '' and s <> '' then
    v := regexp_replace(v, ',?\s*' || regexp_replace(c, '([\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:\-])', '\\\1', 'g') || '\s*,\s*' || regexp_replace(s, '([\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:\-])', '\\\1', 'g') || '\s*$', '', 'i');
  end if;

  if s <> '' and z <> '' then
    v := regexp_replace(v, ',?\s*' || regexp_replace(s, '([\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:\-])', '\\\1', 'g') || '\s*,?\s*' || regexp_replace(z, '([\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:\-])', '\\\1', 'g') || '\s*$', '', 'i');
  end if;

  if z <> '' then
    v := regexp_replace(v, ',?\s*' || regexp_replace(z, '([\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:\-])', '\\\1', 'g') || '\s*$', '', 'i');
  end if;

  v := regexp_replace(v, '\s*,\s*$', '', 'g');
  v := regexp_replace(v, '\s+', ' ', 'g');

  return nullif(trim(v), '');
end;
$$;

update public.locations
set
  address = public.toh_clean_street_address(address, city, state, coalesce(zip_code, zip, postal_code)),
  normalized_address = lower(public.toh_clean_street_address(address, city, state, coalesce(zip_code, zip, postal_code))),
  updated_at = now()
where address is not null
  and (
    address ~* ',\s*New York\s*,\s*NY\s*,?\s*\d{5}\s*$'
    or address ~* ',\s*NY\s*,?\s*\d{5}\s*$'
    or address ~* ',\s*\d{5}\s*$'
  );

update public.locations set borough = 'Queens', neighborhood = coalesce(nullif(neighborhood, ''), 'Long Island City'), market = 'NYC_CORE', updated_at = now() where state = 'NY' and coalesce(zip_code, zip, postal_code) = '11101';
update public.locations set borough = 'Queens', neighborhood = coalesce(nullif(neighborhood, ''), 'Astoria'), market = 'NYC_CORE', updated_at = now() where state = 'NY' and coalesce(zip_code, zip, postal_code) in ('11102', '11103', '11105', '11106');
update public.locations set borough = 'Queens', neighborhood = coalesce(nullif(neighborhood, ''), 'Sunnyside'), market = 'NYC_CORE', updated_at = now() where state = 'NY' and coalesce(zip_code, zip, postal_code) = '11104';
update public.locations set borough = 'Manhattan', market = 'NYC_CORE', updated_at = now() where state = 'NY' and coalesce(zip_code, zip, postal_code) between '10001' and '10040';
update public.locations set borough = 'Brooklyn', market = 'NYC_CORE', updated_at = now() where state = 'NY' and coalesce(zip_code, zip, postal_code) between '11201' and '11256';
update public.locations set borough = 'Bronx', market = 'NYC_CORE', updated_at = now() where state = 'NY' and coalesce(zip_code, zip, postal_code) between '10451' and '10475';
update public.locations set borough = 'Staten Island', market = 'NYC_CORE', updated_at = now() where state = 'NY' and coalesce(zip_code, zip, postal_code) between '10301' and '10314';

update public.locations
set
  market = 'NYC_CORE',
  borough = coalesce(nullif(borough, ''), 'Queens'),
  neighborhood = coalesce(nullif(neighborhood, ''), 'Long Island City'),
  updated_at = now()
where state = 'NY'
  and (
    coalesce(zip_code, zip, postal_code) = '11101'
    or address ilike '%Long Island City%'
    or neighborhood ilike '%Long Island City%'
  );
