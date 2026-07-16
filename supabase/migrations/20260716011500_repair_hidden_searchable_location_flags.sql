-- Keep location searchability consistent with visibility and quality controls.
-- Repairs historical contradictions and prevents future writes from marking
-- hidden, low-level, deleted, suppressed, demo/training, or terminal rows searchable.

create or replace function public.oh_enforce_location_search_visibility()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  effective_status text := lower(coalesce(new.status, new.data_status, new.quality_status, ''));
  visibility text := lower(coalesce(new.public_visibility_tier, ''));
  source_quality text := lower(coalesce(new.source_quality_status, new.quality_status, ''));
begin
  if new.is_searchable is true and (
    new.is_hidden is true
    or new.is_low_level is true
    or visibility = 'hidden'
    or new.deleted_at is not null
    or new.is_suppressed is true
    or new.training_only is true
    or effective_status in ('closed', 'archived', 'deleted', 'duplicate', 'rejected')
    or source_quality in ('low_level_review', 'suppressed', 'generic_restaurant')
    or new.latitude is null
    or new.longitude is null
  ) then
    new.is_searchable := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_location_search_visibility on public.locations;
create trigger trg_enforce_location_search_visibility
before insert or update of
  is_searchable,
  is_hidden,
  is_low_level,
  public_visibility_tier,
  deleted_at,
  is_suppressed,
  training_only,
  status,
  data_status,
  quality_status,
  source_quality_status,
  latitude,
  longitude
on public.locations
for each row
execute function public.oh_enforce_location_search_visibility();

-- Repair existing contradictory rows. This intentionally does not auto-publish
-- enriched imports; those should be restored through the existing reviewed flow.
update public.locations
set is_searchable = false
where is_searchable is true
  and (
    is_hidden is true
    or is_low_level is true
    or lower(coalesce(public_visibility_tier, '')) = 'hidden'
    or deleted_at is not null
    or is_suppressed is true
    or training_only is true
    or lower(coalesce(status, data_status, quality_status, '')) in ('closed', 'archived', 'deleted', 'duplicate', 'rejected')
    or lower(coalesce(source_quality_status, quality_status, '')) in ('low_level_review', 'suppressed', 'generic_restaurant')
    or latitude is null
    or longitude is null
  );

-- Make the enriched NYC-import candidates easy to review without automatically
-- changing their public visibility.
create or replace view public.location_restore_candidates
with (security_invoker = true)
as
select
  id,
  coalesce(nullif(name, ''), nullif(restaurant_name, ''), nullif(activity_name, '')) as display_name,
  location_type,
  address,
  city,
  state,
  rating,
  review_count,
  has_photos,
  low_level_reason,
  low_level_source,
  source_quality_status,
  import_source,
  source,
  updated_at
from public.locations
where is_low_level is true
  and low_level_reason = 'nyc_import_unverified'
  and has_photos is true
  and rating >= 4.0
  and review_count >= 25
  and coalesce(trim(address), '') <> ''
  and latitude is not null
  and longitude is not null
  and coalesce(is_hidden, false) is true;

comment on view public.location_restore_candidates is
  'Enriched low-level NYC import records that meet baseline quality requirements and are candidates for reviewed restoration.';
