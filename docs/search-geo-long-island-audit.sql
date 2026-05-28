select
  county,
  city,
  borough,
  neighborhood,
  state,
  count(*)
from locations
where
  search_document ilike '%long island%'
  or county ilike '%nassau%'
  or county ilike '%suffolk%'
  or city ilike any (array[
    '%Freeport%',
    '%Hempstead%',
    '%Long Beach%',
    '%Glen Cove%',
    '%Huntington%',
    '%Riverhead%',
    '%Babylon%',
    '%Islip%',
    '%Smithtown%',
    '%Southampton%',
    '%East Hampton%',
    '%Patchogue%',
    '%Port Jefferson%'
  ])
group by county, city, borough, neighborhood, state
order by count(*) desc;

select
  id,
  name,
  restaurant_name,
  primary_category,
  cuisine,
  cuisine_type,
  location_type,
  county,
  city,
  borough,
  neighborhood,
  state,
  search_document
from locations
where
  (
    county ilike '%nassau%'
    or county ilike '%suffolk%'
    or search_document ilike '%long island%'
    or city ilike any (array[
      '%Freeport%',
      '%Hempstead%',
      '%Long Beach%',
      '%Glen Cove%',
      '%Huntington%',
      '%Riverhead%',
      '%Babylon%',
      '%Islip%',
      '%Smithtown%',
      '%Southampton%',
      '%East Hampton%',
      '%Patchogue%',
      '%Port Jefferson%'
    ])
  )
limit 100;
