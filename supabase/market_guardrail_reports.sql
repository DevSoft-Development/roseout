-- Query 1: market/state mismatches
select market, state, count(*) as rows, count(*) filter (where is_searchable = true) as searchable_rows
from public.locations
where market in ('NORTHERN_NJ', 'LONG_ISLAND', 'WESTCHESTER', 'STATEN_ISLAND', 'BRONX_OUTER', 'NYC_CORE')
group by market, state
order by market, state;

-- Query 2: Long Island City mislabeled as Long Island
select id, name, address, city, state, borough, market, is_searchable, created_at
from public.locations
where market = 'LONG_ISLAND' and (city ilike '%Long Island City%' or address ilike '%Long Island City%')
order by created_at desc;

-- Query 3: Northern Jersey non-NJ rows
select id, name, address, city, state, market, is_searchable, created_at
from public.locations
where market = 'NORTHERN_NJ' and coalesce(state, '') <> 'NJ'
order by created_at desc;
