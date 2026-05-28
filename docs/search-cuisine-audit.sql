select
primary_category,
cuisine,
cuisine_type,
location_type,
count(*)
from locations
group by primary_category, cuisine, cuisine_type, location_type
order by count(*) desc;

select
id,
name,
restaurant_name,
primary_category,
cuisine,
cuisine_type,
location_type,
search_document
from locations
where
search_document ilike '%steak%'
or primary_category ilike '%steak%'
or cuisine ilike '%steak%'
or cuisine_type ilike '%steak%'
or name ilike '%steak%'
limit 50;

select
id,
name,
restaurant_name,
primary_category,
cuisine,
cuisine_type,
location_type,
city,
borough
from locations
where
city ilike '%Queens%'
or borough ilike '%Queens%'
limit 100;
