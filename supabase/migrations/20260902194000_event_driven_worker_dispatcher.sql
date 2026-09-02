-- Wake the unified worker dispatcher from durable worker_jobs state changes.
-- EventBridge remains a recovery sweep only.

create or replace function private.emit_aws_background_work_signal(
  p_job text,
  p_min_interval interval default interval '20 seconds'
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, net
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
    'worker-dispatcher-unified'
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
end
$$;

revoke all on function private.emit_aws_background_work_signal(text, interval) from public, anon, authenticated;

create or replace function private.signal_worker_dispatcher_work()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.job_type in (
    'photo.backfill',
    'enrichment.google_photos',
    'nightly-photo-backfill',
    'enrichment.google_metadata',
    'search.anchor.reconcile',
    'search.qa.batch',
    'reservation.cleanup',
    'search.document_rebuild',
    'search.embedding_generation',
    'analytics.aggregate',
    'enrichment.ai_profile',
    'enrichment.ai_menu',
    'ml.duplicate_detection.recalculate',
    'review.moderation',
    'location.publishability_repair'
  )
  and new.status = 'queued'
  and coalesce(new.run_after, clock_timestamp()) <= clock_timestamp() + interval '5 seconds'
  and (
    tg_op = 'INSERT'
    or old.status is distinct from new.status
    or old.run_after is distinct from new.run_after
  ) then
    perform private.emit_aws_background_work_signal(
      'worker-dispatcher-unified',
      interval '5 seconds'
    );
  end if;
  return new;
end
$$;

revoke all on function private.signal_worker_dispatcher_work() from public, anon, authenticated;

drop trigger if exists trg_signal_worker_dispatcher_work on public.worker_jobs;
create trigger trg_signal_worker_dispatcher_work
after insert or update of status, run_after on public.worker_jobs
for each row execute function private.signal_worker_dispatcher_work();
