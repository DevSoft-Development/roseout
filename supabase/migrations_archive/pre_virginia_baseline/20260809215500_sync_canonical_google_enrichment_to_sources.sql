create or replace function public.sync_canonical_google_enrichment_to_source()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.google_enriched_at is null then
    return new;
  end if;

  if new.source_table = 'restaurants' and new.source_id is not null then
    update public.restaurants
    set
      google_place_id = coalesce(new.google_place_id, google_place_id),
      google_enrichment_status = new.google_enrichment_status,
      google_enriched_at = new.google_enriched_at,
      google_primary_type = new.google_primary_type,
      google_types = new.google_types,
      google_maps_uri = new.google_maps_uri,
      google_website_uri = new.google_website_uri,
      google_rating = new.google_rating,
      google_user_rating_count = new.google_user_rating_count,
      google_last_error = new.google_last_error
    where id = new.source_id
      and (google_enriched_at is null or google_enriched_at < new.google_enriched_at);
  elsif new.source_table = 'activities' and new.source_id is not null then
    update public.activities
    set
      google_place_id = coalesce(new.google_place_id, google_place_id),
      google_enrichment_status = new.google_enrichment_status,
      google_enriched_at = new.google_enriched_at,
      google_primary_type = new.google_primary_type,
      google_types = new.google_types,
      google_maps_uri = new.google_maps_uri,
      google_website_uri = new.google_website_uri,
      google_rating = new.google_rating,
      google_user_rating_count = new.google_user_rating_count,
      google_last_error = new.google_last_error
    where id = new.source_id
      and (google_enriched_at is null or google_enriched_at < new.google_enriched_at);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_canonical_google_enrichment_to_source on public.locations;

create trigger trg_sync_canonical_google_enrichment_to_source
after insert or update of google_enriched_at, google_place_id, google_enrichment_status, google_primary_type, google_types, google_maps_uri, google_website_uri, google_rating, google_user_rating_count, google_last_error
on public.locations
for each row
when (new.google_enriched_at is not null)
execute function public.sync_canonical_google_enrichment_to_source();

-- Backfill already-enriched canonical rows so the dashboard and source records
-- agree immediately without spending additional Google API calls.
update public.restaurants r
set
  google_place_id = coalesce(l.google_place_id, r.google_place_id),
  google_enrichment_status = l.google_enrichment_status,
  google_enriched_at = l.google_enriched_at,
  google_primary_type = l.google_primary_type,
  google_types = l.google_types,
  google_maps_uri = l.google_maps_uri,
  google_website_uri = l.google_website_uri,
  google_rating = l.google_rating,
  google_user_rating_count = l.google_user_rating_count,
  google_last_error = l.google_last_error
from public.locations l
where l.source_table = 'restaurants'
  and l.source_id = r.id
  and l.google_enriched_at is not null
  and (r.google_enriched_at is null or r.google_enriched_at < l.google_enriched_at);

update public.activities a
set
  google_place_id = coalesce(l.google_place_id, a.google_place_id),
  google_enrichment_status = l.google_enrichment_status,
  google_enriched_at = l.google_enriched_at,
  google_primary_type = l.google_primary_type,
  google_types = l.google_types,
  google_maps_uri = l.google_maps_uri,
  google_website_uri = l.google_website_uri,
  google_rating = l.google_rating,
  google_user_rating_count = l.google_user_rating_count,
  google_last_error = l.google_last_error
from public.locations l
where l.source_table = 'activities'
  and l.source_id = a.id
  and l.google_enriched_at is not null
  and (a.google_enriched_at is null or a.google_enriched_at < l.google_enriched_at);
