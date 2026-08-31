-- Keep the permanent TheOutHaven Lounge test fixture idempotent without
-- hardcoding its generated location id. The demo seed historically could not
-- tag these two tables, so repeated refreshes accumulated duplicate rows.

with fixture as (
  select id
  from public.locations
  where demo_key = 'real_location_mirror_demo'
), ranked as (
  select
    li.id,
    row_number() over (
      partition by li.location_id, li.item_name
      order by li.created_at asc nulls last, li.id
    ) as row_number
  from public.layout_items li
  join fixture f on f.id = li.location_id
  where li.item_name in (
    'Table 1',
    'Table 2',
    'VIP Booth',
    'Bar Seats',
    'Private Room',
    'Patio Table'
  )
)
delete from public.layout_items li
using ranked r
where li.id = r.id
  and r.row_number > 1;

with fixture as (
  select id
  from public.locations
  where demo_key = 'real_location_mirror_demo'
), ranked as (
  select
    bi.id,
    row_number() over (
      partition by bi.location_id, bi.item_name
      order by bi.created_at asc nulls last, bi.id
    ) as row_number
  from public.location_bookable_items bi
  join fixture f on f.id = bi.location_id
  where bi.item_name in (
    'Table 1',
    'Table 2',
    'VIP Booth',
    'Bar Seats',
    'Private Room',
    'Patio Table'
  )
)
delete from public.location_bookable_items bi
using ranked r
where bi.id = r.id
  and r.row_number > 1;
