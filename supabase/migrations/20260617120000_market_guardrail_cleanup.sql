-- Market guardrail cleanup: never delete locations; only remove public searchability or correct LIC.
do $$
begin
  if to_regclass('public.locations') is null then
    return;
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='locations' and column_name='is_searchable') then
    update public.locations set is_searchable = false where market = 'NORTHERN_NJ' and coalesce(state, '') <> 'NJ';
    update public.locations set is_searchable = false where market = 'LONG_ISLAND' and coalesce(state, '') <> 'NY';
    update public.locations set is_searchable = false where market = 'WESTCHESTER' and coalesce(state, '') <> 'NY';
    update public.locations set is_searchable = false where market = 'STATEN_ISLAND' and coalesce(state, '') <> 'NY';
    update public.locations set is_searchable = false where market = 'BRONX_OUTER' and coalesce(state, '') <> 'NY';
    update public.locations set is_searchable = false where market = 'NYC_CORE' and coalesce(state, '') <> 'NY';

    update public.locations
    set is_searchable = false
    where market = 'NORTHERN_NJ'
      and (address ilike '%, DE %' or address ilike '%, CA %' or address ilike '%, PA %' or address ilike '%, OH %' or address ilike '%, CT %');
  end if;

  update public.locations
  set market = 'NYC_CORE',
      borough = coalesce(nullif(borough, ''), 'Queens'),
      city = 'New York'
  where market = 'LONG_ISLAND'
    and (city ilike '%Long Island City%' or address ilike '%Long Island City%');

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='locations' and column_name='neighborhood') then
    update public.locations
    set neighborhood = 'Long Island City'
    where market = 'NYC_CORE'
      and (city ilike '%Long Island City%' or address ilike '%Long Island City%');
  end if;
end $$;
