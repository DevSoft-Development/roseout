-- Hardening for photo ownership rollout.
-- 1) Stop photo reminders as soon as the owner reaches 3 photos.
-- 2) Protect owner-controlled hero imagery from Google enrichment overwrites.
-- 3) Add a tiny, reversible profile-quality contribution to search_boost.

alter table public.locations
  add column if not exists profile_photo_search_boost numeric not null default 0;

create or replace function public.sync_location_photo_ownership()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_owner_count integer;
  v_previous_component numeric := 0;
  v_next_component numeric := 0;
  v_base_search_boost numeric := 0;
begin
  new.owner_photo_urls := coalesce((
    select array_agg(distinct u order by u)
    from unnest(coalesce(new.owner_photo_urls, '{}'::text[])) as u
    where nullif(btrim(u),'') is not null
  ), '{}'::text[]);

  v_owner_count := cardinality(new.owner_photo_urls);
  new.owner_photo_count := v_owner_count;
  new.has_owner_photos := v_owner_count > 0;

  -- Three photos ends onboarding reminders; five remains the full gallery target.
  if v_owner_count >= 3 then
    new.photo_nudges_completed := true;
  elsif tg_op = 'UPDATE' then
    -- Never restart an already-completed reminder sequence if an owner later removes a photo.
    new.photo_nudges_completed := coalesce(old.photo_nudges_completed,false);
  end if;

  new.profile_completion_score := public.location_profile_completion_score(new);

  -- Keep the ranking effect intentionally tiny (max +3) and reversible so it can
  -- never overpower intent, geo, hours, cuisine/category, or review relevance.
  v_next_component := case
    when v_owner_count >= 5 then 3.0
    when v_owner_count >= 3 then 2.0
    when v_owner_count >= 1 then 1.0
    else 0.0
  end;

  if tg_op = 'UPDATE' then
    v_previous_component := coalesce(old.profile_photo_search_boost,0);
  end if;
  v_base_search_boost := coalesce(new.search_boost,0) - v_previous_component;
  new.profile_photo_search_boost := v_next_component;
  new.search_boost := v_base_search_boost + v_next_component;

  return new;
end;
$$;

revoke all on function public.sync_location_photo_ownership() from public, anon, authenticated;

-- The count is derived inside a BEFORE trigger, so UPDATE OF owner_photo_count would
-- not reliably fire. Watch the actual owner photo array instead.
drop trigger if exists trg_finish_photo_nudges_after_upload on public.locations;

create or replace function public.finish_photo_nudges_after_upload()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old_count integer := cardinality(coalesce(old.owner_photo_urls,'{}'::text[]));
  v_new_count integer := cardinality(coalesce(new.owner_photo_urls,'{}'::text[]));
begin
  if v_new_count >= 3 and v_old_count < 3 then
    update public.profile_completion_nurture_queue
    set status = 'skipped',
        last_error = 'Owner reached recommended photo minimum',
        updated_at = now()
    where location_id = new.id
      and message_type in ('photo_reminder_day3','photo_reminder_day7')
      and status in ('pending','failed','needs_consent');

    update public.crm_tasks
    set status = 'cancelled',
        updated_at = now()
    where location_id = new.id
      and source = 'photo_completion_nudge'
      and source_record_id = new.id::text
      and status in ('open','in_progress','blocked');
  end if;
  return new;
end;
$$;

revoke all on function public.finish_photo_nudges_after_upload() from public, anon, authenticated;

create trigger trg_finish_photo_nudges_after_upload
after update of owner_photo_urls on public.locations
for each row
execute function public.finish_photo_nudges_after_upload();

-- Google enrichment may continue to update place IDs and other metadata, but once an
-- owner controls the hero we never allow a Google photo refresh to take it back over.
create or replace function public.protect_owner_photo_from_google_overwrite()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_google_attempt boolean;
  v_owner_hero text;
begin
  if coalesce(old.owner_photo_count,0) <= 0 then
    return new;
  end if;

  v_google_attempt :=
    lower(coalesce(new.photo_source,'')) like 'google%' or
    coalesce(new.main_image,'') like '%/api/public/google-place-photo%' or
    coalesce(new.image_url,'') like '%/api/public/google-place-photo%' or
    coalesce(new.main_image,'') like '%maps.googleapis.com/maps/api/place/photo%' or
    coalesce(new.image_url,'') like '%maps.googleapis.com/maps/api/place/photo%';

  if not v_google_attempt then
    return new;
  end if;

  v_owner_hero := coalesce(
    nullif(btrim(old.owner_primary_photo_url),''),
    nullif(btrim(old.main_image),''),
    nullif(btrim(old.image_url),'')
  );

  if v_owner_hero is not null then
    new.main_image := v_owner_hero;
    new.image_url := v_owner_hero;
  end if;
  new.photo_source := old.photo_source;
  new.photo_status := old.photo_status;
  return new;
end;
$$;

revoke all on function public.protect_owner_photo_from_google_overwrite() from public, anon, authenticated;

drop trigger if exists trg_protect_owner_photo_from_google_overwrite on public.locations;
create trigger trg_protect_owner_photo_from_google_overwrite
before update of main_image, image_url, photo_source, photo_status on public.locations
for each row
execute function public.protect_owner_photo_from_google_overwrite();

-- Recompute existing rows with the hardened derivation after both migrations land.
update public.locations
set owner_photo_urls = coalesce(owner_photo_urls,'{}'::text[]);
