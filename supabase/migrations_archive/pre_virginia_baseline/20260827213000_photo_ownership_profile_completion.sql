-- Photo ownership, five-photo Google fallback budgeting, profile completion,
-- and gentle claimed-business photo nudges.

alter table public.locations
  add column if not exists owner_photo_urls text[] not null default '{}'::text[],
  add column if not exists owner_primary_photo_url text,
  add column if not exists owner_photo_count integer not null default 0,
  add column if not exists has_owner_photos boolean not null default false,
  add column if not exists profile_completion_score integer not null default 0,
  add column if not exists photo_nudge_count integer not null default 0,
  add column if not exists last_photo_nudge_at timestamptz,
  add column if not exists photo_nudges_completed boolean not null default false;

create index if not exists locations_claimed_owner_photo_count_idx
  on public.locations (owner_photo_count, claimed_at desc)
  where coalesce(is_claimed,false) or owner_user_id is not null or claim_status = 'approved';

create index if not exists locations_google_photo_fallback_idx
  on public.locations (google_place_id)
  where google_place_id is not null and btrim(google_place_id) <> '';

-- Backfill known owner uploads from the existing location-images bucket.
update public.locations
set owner_photo_urls = coalesce((
      select array_agg(distinct u order by u)
      from unnest(coalesce(images, '{}'::text[])) as u
      where u like '%/storage/v1/object/public/location-images/%'
    ), '{}'::text[]),
    owner_primary_photo_url = case
      when coalesce(main_image,'') like '%/storage/v1/object/public/location-images/%' then main_image
      when coalesce(image_url,'') like '%/storage/v1/object/public/location-images/%' then image_url
      else owner_primary_photo_url
    end
where photo_status = 'owner_photo'
  and cardinality(coalesce(owner_photo_urls, '{}'::text[])) = 0;

create or replace function public.location_profile_completion_score(p_location public.locations)
returns integer
language sql
immutable
set search_path = public
as $$
  select least(100, greatest(0,
    -- identity
    case when nullif(btrim(coalesce(p_location.name,p_location.restaurant_name,p_location.activity_name,'')), '') is not null then 10 else 0 end +
    -- verified address
    case when nullif(btrim(coalesce(p_location.address,'')), '') is not null
           and nullif(btrim(coalesce(p_location.city,'')), '') is not null then 10 else 0 end +
    -- hours
    case when (p_location.operating_hours is not null and p_location.operating_hours <> '{}'::jsonb)
           or nullif(btrim(coalesce(p_location.hours,'')), '') is not null then 10 else 0 end +
    -- contact
    case when nullif(btrim(coalesce(p_location.phone,p_location.website,p_location.website_url,'')), '') is not null then 10 else 0 end +
    -- description
    case when nullif(btrim(coalesce(p_location.short_description,p_location.description,'')), '') is not null then 10 else 0 end +
    -- category
    case when nullif(btrim(coalesce(p_location.primary_category,p_location.category,p_location.cuisine,p_location.activity_type,'')), '') is not null then 10 else 0 end +
    -- booking/reservation path
    case when nullif(btrim(coalesce(p_location.reservation_url,p_location.external_reservation_url,p_location.booking_url,p_location.reservation_link,p_location.reservation_platform_url,'')), '') is not null then 10 else 0 end +
    -- ownership confidence
    case when coalesce(p_location.is_claimed,false) or p_location.owner_user_id is not null or p_location.claim_status = 'approved' then 10 else 0 end +
    -- owner-controlled photography (20 total)
    case
      when coalesce(p_location.owner_photo_count,0) >= 5 then 20
      when coalesce(p_location.owner_photo_count,0) >= 3 then 12
      when coalesce(p_location.owner_photo_count,0) >= 1 then 5
      else 0
    end
  ));
$$;

revoke all on function public.location_profile_completion_score(public.locations) from public, anon, authenticated;

create or replace function public.sync_location_photo_ownership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.owner_photo_urls := coalesce((
    select array_agg(distinct u order by u)
    from unnest(coalesce(new.owner_photo_urls, '{}'::text[])) as u
    where nullif(btrim(u),'') is not null
  ), '{}'::text[]);

  new.owner_photo_count := cardinality(new.owner_photo_urls);
  new.has_owner_photos := new.owner_photo_count > 0;

  if new.owner_photo_count >= 5 then
    new.photo_nudges_completed := true;
  end if;

  new.profile_completion_score := public.location_profile_completion_score(new);
  return new;
end;
$$;

revoke all on function public.sync_location_photo_ownership() from public, anon, authenticated;

drop trigger if exists trg_sync_location_photo_ownership on public.locations;
create trigger trg_sync_location_photo_ownership
before insert or update of
  owner_photo_urls, owner_primary_photo_url,
  name, restaurant_name, activity_name,
  address, city, operating_hours, hours,
  phone, website, website_url,
  short_description, description,
  primary_category, category, cuisine, activity_type,
  reservation_url, external_reservation_url, booking_url, reservation_link, reservation_platform_url,
  is_claimed, owner_user_id, claim_status
on public.locations
for each row execute function public.sync_location_photo_ownership();

-- Ensure existing rows receive current derived values.
update public.locations
set owner_photo_urls = owner_photo_urls;

-- Extend the existing profile-completion nurture queue rather than creating a parallel reminder system.
alter table public.profile_completion_nurture_queue
  drop constraint if exists profile_completion_nurture_queue_message_type_check;
alter table public.profile_completion_nurture_queue
  add constraint profile_completion_nurture_queue_message_type_check
  check (message_type in ('completion_confirmation','upgrade_intro','photo_reminder_day3','photo_reminder_day7'));

create or replace function public.enqueue_claimed_location_photo_nudges()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_claimed boolean;
  v_claim public.location_claim_requests%rowtype;
  v_channel text;
  v_contact text;
  v_name text;
  v_anchor timestamptz;
begin
  v_claimed := coalesce(new.is_claimed,false) or new.owner_user_id is not null or new.claim_status = 'approved';
  if not v_claimed or coalesce(new.owner_photo_count,0) >= 3 then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (coalesce(old.is_claimed,false) or old.owner_user_id is not null or old.claim_status = 'approved')
       and old.owner_user_id is not distinct from new.owner_user_id
       and old.claim_status is not distinct from new.claim_status then
      return new;
    end if;
  end if;

  select * into v_claim
  from public.location_claim_requests
  where location_id = new.id
  order by (status = 'approved') desc, coalesce(reviewed_at, submitted_at, created_at) desc
  limit 1;

  v_channel := coalesce(v_claim.verified_contact_channel,
    case
      when nullif(btrim(coalesce(new.owner_email,'')), '') is not null then 'email'
      when nullif(btrim(coalesce(new.owner_phone,'')), '') is not null then 'sms'
      else null
    end);
  v_contact := coalesce(v_claim.verified_contact,
    case when v_channel = 'email' then new.owner_email
         when v_channel = 'sms' then new.owner_phone
         else null end);
  v_name := coalesce(nullif(new.name,''), nullif(new.restaurant_name,''), nullif(new.activity_name,''), 'Your business');
  v_anchor := coalesce(new.claimed_at, now());

  insert into public.profile_completion_nurture_queue(
    location_id, claim_request_id, message_type, contact_channel, contact, status, due_at, metadata
  ) values (
    new.id, v_claim.id, 'photo_reminder_day3', v_channel, v_contact,
    case when v_contact is null or v_channel is null then 'skipped' else 'pending' end,
    v_anchor + interval '3 days',
    jsonb_build_object('business_name',v_name,'recommended_photos',5,'minimum_photos',3,'source','claim_photo_onboarding')
  ) on conflict (location_id, message_type) do nothing;

  insert into public.profile_completion_nurture_queue(
    location_id, claim_request_id, message_type, contact_channel, contact, status, due_at, metadata
  ) values (
    new.id, v_claim.id, 'photo_reminder_day7', v_channel, v_contact,
    case when v_contact is null or v_channel is null then 'skipped' else 'pending' end,
    v_anchor + interval '7 days',
    jsonb_build_object('business_name',v_name,'recommended_photos',5,'minimum_photos',3,'source','claim_photo_onboarding')
  ) on conflict (location_id, message_type) do nothing;

  if not exists (
    select 1 from public.crm_tasks
    where location_id = new.id
      and source = 'photo_completion_nudge'
      and source_record_id = new.id::text
      and archived_at is null
  ) then
    insert into public.crm_tasks(
      location_id, title, description, task_type, status, priority,
      due_at, reminder_at, source, source_record_id,
      queue_key, category, subtype, workflow_key, workflow_stage,
      assignment_reason, metadata
    ) values (
      new.id,
      'Photo follow-up: ' || v_name,
      'Claimed location has fewer than 3 owner photos. Offer help completing the gallery; do not pressure the owner.',
      'profile_review','open','low',
      v_anchor + interval '8 days', v_anchor + interval '8 days',
      'photo_completion_nudge', new.id::text,
      'onboarding','profile','photos','claimed_business_activation','photos_needed',
      'Claimed business has fewer than 3 owner-controlled photos',
      jsonb_build_object('owner_photo_count',coalesce(new.owner_photo_count,0),'recommended_photos',5,'minimum_photos',3)
    );
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_claimed_location_photo_nudges() from public, anon, authenticated;

drop trigger if exists trg_enqueue_claimed_location_photo_nudges on public.locations;
create trigger trg_enqueue_claimed_location_photo_nudges
after insert or update of is_claimed, owner_user_id, claim_status, claimed_at
on public.locations
for each row execute function public.enqueue_claimed_location_photo_nudges();

create or replace function public.finish_photo_nudges_after_upload()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.owner_photo_count,0) >= 3 and coalesce(old.owner_photo_count,0) < 3 then
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

    new.photo_nudges_completed := true;
  end if;
  return new;
end;
$$;

revoke all on function public.finish_photo_nudges_after_upload() from public, anon, authenticated;

drop trigger if exists trg_finish_photo_nudges_after_upload on public.locations;
create trigger trg_finish_photo_nudges_after_upload
before update of owner_photo_count on public.locations
for each row execute function public.finish_photo_nudges_after_upload();

-- Track Google photo-media calls so the application can enforce a monthly budget.
create table if not exists public.google_photo_usage_monthly (
  usage_month date primary key,
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.google_photo_usage_monthly enable row level security;
revoke all on table public.google_photo_usage_monthly from anon, authenticated;

create or replace function public.reserve_google_photo_request(
  p_google_place_id text,
  p_monthly_cap integer default 15000
)
returns table(allowed boolean, month_count integer)
language plpgsql
set search_path = public
as $$
declare
  v_month date := date_trunc('month', now())::date;
  v_count integer;
begin
  insert into public.google_photo_usage_monthly(usage_month, request_count, updated_at)
  values (v_month, 0, now())
  on conflict (usage_month) do nothing;

  select request_count into v_count
  from public.google_photo_usage_monthly
  where usage_month = v_month
  for update;

  if p_monthly_cap > 0 and v_count >= p_monthly_cap then
    allowed := false;
    month_count := v_count;
    return next;
    return;
  end if;

  update public.google_photo_usage_monthly
  set request_count = request_count + 1,
      updated_at = now()
  where usage_month = v_month
  returning request_count into v_count;

  insert into public.google_photo_usage_daily(usage_date, google_place_id, request_count, last_requested_at)
  values (current_date, coalesce(nullif(p_google_place_id,''),'unknown'), 1, now())
  on conflict (usage_date, google_place_id)
  do update set request_count = public.google_photo_usage_daily.request_count + 1,
                last_requested_at = now();

  allowed := true;
  month_count := v_count;
  return next;
end;
$$;

revoke all on function public.reserve_google_photo_request(text,integer) from public, anon, authenticated;
