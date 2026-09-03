-- Make Search ML maintenance event-driven now that the bulk tag backlog is drained.
-- Database mutations wake the durable AWS background queue; EventBridge remains
-- a low-frequency recovery mechanism. Virginia pg_cron remains intentionally empty.

create or replace function private.emit_aws_background_work_signal(
  p_job text,
  p_min_interval interval default interval '20 seconds'
)
returns bigint
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private', 'vault', 'net'
as $$
declare
  endpoint text;
  token text;
  previous timestamptz;
  request_id bigint;
begin
  if p_job not in (
    'location-search-profile-worker',
    'catalog-enrichment-runner',
    'location-description-backfill',
    'claim-qr-repair-worker',
    'unified-location-gap-repair',
    'worker-dispatcher-unified',
    'location-enrichment-reconcile',
    'cron-alert-dispatcher',
    'search-ml-learning-maintenance'
  ) then
    raise exception 'unsupported_background_work_signal_job:%', p_job;
  end if;

  perform pg_advisory_xact_lock(hashtext('aws-background-work-signal:' || p_job));

  select last_signaled_at into previous
  from private.aws_background_work_signal_state
  where job_key = p_job;

  if previous is not null and previous > clock_timestamp() - p_min_interval then
    return null;
  end if;

  select decrypted_secret into endpoint
  from vault.decrypted_secrets
  where name = 'aws_background_work_signal_url'
  limit 1;

  select decrypted_secret into token
  from vault.decrypted_secrets
  where name = 'aws_background_work_signal_secret'
  limit 1;

  if nullif(btrim(endpoint), '') is null or nullif(btrim(token), '') is null then
    return null;
  end if;

  insert into private.aws_background_work_signal_state(job_key, last_signaled_at, updated_at)
  values (p_job, clock_timestamp(), clock_timestamp())
  on conflict (job_key) do update
    set last_signaled_at = excluded.last_signaled_at,
        updated_at = excluded.updated_at;

  select net.http_post(
    url := endpoint,
    body := jsonb_build_object('job', p_job),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-toh-work-signal', token
    ),
    timeout_milliseconds := 2000
  ) into request_id;

  update private.aws_background_work_signal_state
  set last_request_id = request_id,
      updated_at = clock_timestamp()
  where job_key = p_job;

  return request_id;
end;
$$;

create or replace function private.signal_search_ml_location_change()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  if tg_op = 'INSERT' then
    perform private.emit_aws_background_work_signal('search-ml-learning-maintenance', interval '10 seconds');
  elsif old.name is distinct from new.name
    or old.restaurant_name is distinct from new.restaurant_name
    or old.activity_name is distinct from new.activity_name
    or old.location_type is distinct from new.location_type
    or old.description is distinct from new.description
    or old.short_description is distinct from new.short_description
    or old.cuisine is distinct from new.cuisine
    or old.cuisine_type is distinct from new.cuisine_type
    or old.special_features is distinct from new.special_features
    or old.tags is distinct from new.tags
    or old.vibe_tags is distinct from new.vibe_tags
    or old.best_for_tags is distinct from new.best_for_tags
    or old.signature_items is distinct from new.signature_items
    or old.is_searchable is distinct from new.is_searchable
    or old.is_hidden is distinct from new.is_hidden
    or old.active is distinct from new.active
    or old.deleted_at is distinct from new.deleted_at
  then
    perform private.emit_aws_background_work_signal('search-ml-learning-maintenance', interval '10 seconds');
  end if;
  return new;
end;
$$;

revoke all on function private.signal_search_ml_location_change() from public, anon, authenticated;

drop trigger if exists trg_signal_search_ml_location_change on public.locations;
create trigger trg_signal_search_ml_location_change
after insert or update of
  name, restaurant_name, activity_name, location_type, description, short_description,
  cuisine, cuisine_type, special_features, tags, vibe_tags, best_for_tags,
  signature_items, is_searchable, is_hidden, active, deleted_at
on public.locations
for each row execute function private.signal_search_ml_location_change();

create or replace function private.signal_search_ml_profile_food_change()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  if tg_op = 'INSERT' or old.foods is distinct from new.foods then
    perform private.emit_aws_background_work_signal('search-ml-learning-maintenance', interval '10 seconds');
  end if;
  return new;
end;
$$;

revoke all on function private.signal_search_ml_profile_food_change() from public, anon, authenticated;

drop trigger if exists trg_signal_search_ml_profile_food_change on public.location_search_profiles;
create trigger trg_signal_search_ml_profile_food_change
after insert or update of foods
on public.location_search_profiles
for each row execute function private.signal_search_ml_profile_food_change();

create or replace function private.signal_search_ml_analytics_event()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  if new.event_name in ('location_clicked', 'result_clicked', 'location_saved', 'result_saved') then
    perform private.emit_aws_background_work_signal('search-ml-learning-maintenance', interval '10 seconds');
  end if;
  return new;
end;
$$;

revoke all on function private.signal_search_ml_analytics_event() from public, anon, authenticated;

drop trigger if exists trg_signal_search_ml_analytics_event on public.analytics_events;
create trigger trg_signal_search_ml_analytics_event
after insert on public.analytics_events
for each row execute function private.signal_search_ml_analytics_event();

create or replace function private.signal_search_ml_negative_feedback()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  perform private.emit_aws_background_work_signal('search-ml-learning-maintenance', interval '10 seconds');
  return new;
end;
$$;

revoke all on function private.signal_search_ml_negative_feedback() from public, anon, authenticated;

drop trigger if exists trg_signal_search_ml_negative_feedback on public.search_negative_feedback;
create trigger trg_signal_search_ml_negative_feedback
after insert on public.search_negative_feedback
for each row execute function private.signal_search_ml_negative_feedback();

create or replace function private.signal_search_ml_outing_change()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('booked', 'confirmed', 'completed') then
      perform private.emit_aws_background_work_signal('search-ml-learning-maintenance', interval '10 seconds');
    end if;
  elsif new.status in ('booked', 'confirmed', 'completed')
    and (
      old.status is distinct from new.status
      or old.restaurant_id is distinct from new.restaurant_id
      or old.activity_id is distinct from new.activity_id
      or old.booked_at is distinct from new.booked_at
      or old.completed_at is distinct from new.completed_at
    )
  then
    perform private.emit_aws_background_work_signal('search-ml-learning-maintenance', interval '10 seconds');
  end if;
  return new;
end;
$$;

revoke all on function private.signal_search_ml_outing_change() from public, anon, authenticated;

drop trigger if exists trg_signal_search_ml_outing_change on public.user_outings;
create trigger trg_signal_search_ml_outing_change
after insert or update of status, restaurant_id, activity_id, booked_at, completed_at
on public.user_outings
for each row execute function private.signal_search_ml_outing_change();
