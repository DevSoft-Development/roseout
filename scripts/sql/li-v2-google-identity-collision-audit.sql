-- Read-only LI V2 Google Place ID collision certification.
-- A repeated Google ID does not by itself prove duplicate businesses.
-- In particular, different businesses may share a venue-level Google ID.
-- Never automatically delete, unpublish, or rewrite TOH location IDs.
with groups as (
  select google_place_id,
         count(*) as all_rows,
         count(*) filter (where is_searchable is true) as searchable_rows,
         count(*) filter (where duplicate_status = 'duplicate') as already_marked,
         count(distinct lower(regexp_replace(coalesce(name,''), '[^a-z0-9]', '', 'g')))
           filter (where is_searchable is true) as searchable_names,
         count(distinct lower(regexp_replace(coalesce(address,''), '[^a-z0-9]', '', 'g')))
           filter (where is_searchable is true) as searchable_addresses
  from public.locations
  where nullif(btrim(google_place_id), '') is not null
  group by google_place_id
  having count(*) > 1
)
select google_place_id, all_rows, searchable_rows, already_marked,
       case
         when searchable_rows <= 1 then 'historical_not_active_collision'
         when searchable_names > 1 or searchable_addresses > 1 then 'manual_identity_provenance_review'
         else 'possible_same_business_manual_review'
       end as action
from groups
order by searchable_rows desc, all_rows desc, google_place_id;
