-- Location Intelligence PR 6: event-driven photo recovery.
-- Immediate catalog enrichment already attempts the Google photo cache. This
-- trigger queues the existing durable photo worker only when that enrichment
-- attempt still leaves the location without a usable photo. The nightly recovery
-- schedule remains intact.

create or replace function private.enqueue_location_intelligence_photo_recovery()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  idempotency_key text;
begin
  if coalesce(new.is_demo, false) then
    return new;
  end if;

  if nullif(btrim(coalesce(new.google_place_id, '')), '') is null then
    return new;
  end if;

  if coalesce(new.has_photos, false)
     or nullif(btrim(coalesce(new.main_image, '')), '') is not null
     or nullif(btrim(coalesce(new.image_url, '')), '') is not null
     or nullif(btrim(coalesce(new.storage_photo_url, '')), '') is not null
     or coalesce(new.owner_photo_count, 0) > 0
     or nullif(btrim(coalesce(new.owner_primary_photo_url, '')), '') is not null then
    return new;
  end if;

  if old.google_place_id is not distinct from new.google_place_id
     and old.google_enriched_at is not distinct from new.google_enriched_at
     and old.photo_backfill_error is not distinct from new.photo_backfill_error then
    return new;
  end if;

  idempotency_key := 'location-intelligence-photo-recovery:'
    || new.id::text || ':'
    || to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD');

  perform public.enqueue_worker_job(
    p_job_type => 'enrichment.google_photos',
    p_payload => jsonb_build_object(
      'source', 'location_intelligence_recovery',
      'locationId', new.id,
      'batchSize', 50,
      'onlySearchable', false,
      'onlyPublishReady', false
    ),
    p_payload_version => 1,
    p_idempotency_key => idempotency_key,
    p_priority => 40,
    p_max_attempts => 5,
    p_run_after => clock_timestamp(),
    p_created_by_label => 'location_intelligence_photo_recovery'
  );

  return new;
end;
$$;

revoke all on function private.enqueue_location_intelligence_photo_recovery() from public, anon, authenticated;

drop trigger if exists trg_location_intelligence_photo_recovery_update on public.locations;
create trigger trg_location_intelligence_photo_recovery_update
after update of google_place_id, google_enriched_at, photo_backfill_error
on public.locations
for each row
execute function private.enqueue_location_intelligence_photo_recovery();

comment on function private.enqueue_location_intelligence_photo_recovery() is
  'Queues the existing enrichment.google_photos worker when canonical Location Intelligence enrichment leaves a Google-matched location without a usable photo. Does not publish locations.';
