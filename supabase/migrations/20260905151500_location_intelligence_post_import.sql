-- Event-driven post-import Location Intelligence inbox.
-- All location inserts enter one durable inbox. The existing AWS catalog
-- enrichment runtime drains it without bypassing the single-active-run guard.

create table if not exists public.location_intelligence_inbox (
  location_id uuid primary key references public.locations(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','attached','failed','skipped')),
  run_id uuid references public.location_enrichment_runs(id) on delete set null,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists location_intelligence_inbox_queue_idx
  on public.location_intelligence_inbox(status, next_attempt_at, created_at)
  where status = 'queued';

alter table public.location_intelligence_inbox enable row level security;
revoke all on table public.location_intelligence_inbox from public, anon, authenticated;
grant select, insert, update, delete on table public.location_intelligence_inbox to service_role;

create or replace function private.enqueue_location_intelligence_after_insert()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_skip_external boolean;
begin
  v_skip_external := coalesce(new.is_demo, false) or coalesce(new.training_only, false);

  perform public.record_location_intelligence_stage(
    new.id,
    'intake',
    'completed',
    'location_created',
    null,
    null,
    null,
    jsonb_build_object(
      'createdSource', coalesce(new.created_source, new.import_source, new.source_table, 'unknown'),
      'skipExternalEnrichment', v_skip_external
    )
  );

  if v_skip_external then
    insert into public.location_intelligence_inbox(location_id, status, last_error)
    values (new.id, 'skipped', 'demo_or_training_location')
    on conflict (location_id) do nothing;

    perform public.record_location_intelligence_stage(
      new.id,
      'complete',
      'completed',
      'external_enrichment_skipped',
      null,
      null,
      null,
      jsonb_build_object('reason', 'demo_or_training_location')
    );
    return new;
  end if;

  insert into public.location_intelligence_inbox(location_id, status)
  values (new.id, 'queued')
  on conflict (location_id) do update
    set status = case when public.location_intelligence_inbox.status = 'attached' then 'attached' else 'queued' end,
        next_attempt_at = least(public.location_intelligence_inbox.next_attempt_at, clock_timestamp()),
        updated_at = clock_timestamp();

  perform public.record_location_intelligence_stage(
    new.id,
    'google_identity',
    'pending',
    'post_import_enrichment_queued',
    null,
    null,
    null,
    '{}'::jsonb
  );

  perform private.emit_aws_background_work_signal('catalog-enrichment-runner', interval '1 second');
  return new;
end;
$$;

revoke all on function private.enqueue_location_intelligence_after_insert()
  from public, anon, authenticated;

drop trigger if exists trg_enqueue_location_intelligence_after_insert on public.locations;
create trigger trg_enqueue_location_intelligence_after_insert
after insert on public.locations
for each row execute function private.enqueue_location_intelligence_after_insert();

create or replace function public.attach_location_intelligence_inbox(p_limit integer default 25)
returns jsonb
language plpgsql
security invoker
set search_path = 'pg_catalog', 'public'
as $$
declare
  v_run public.location_enrichment_runs;
  v_queued integer;
  v_attached integer := 0;
  v_calls integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('location-intelligence-post-import-attach'));

  select count(*) into v_queued
  from public.location_intelligence_inbox
  where status = 'queued' and next_attempt_at <= clock_timestamp();

  if v_queued = 0 then
    return jsonb_build_object('attached', 0, 'reason', 'no_queued_locations');
  end if;

  select * into v_run
  from public.location_enrichment_runs
  where status in ('planned','queued','running')
  order by created_at asc
  limit 1;

  if v_run.id is not null and (
    v_run.status <> 'running'
    or coalesce(v_run.settings ->> 'origin', '') <> 'location_intelligence_post_import'
  ) then
    return jsonb_build_object(
      'attached', 0,
      'reason', 'active_manual_enrichment_run',
      'activeRunId', v_run.id,
      'activeRunStatus', v_run.status
    );
  end if;

  if v_run.id is null then
    insert into public.location_enrichment_runs(
      status, mode, source_table, batch_size, settings, started_at, updated_at
    ) values (
      'running', 'repair', 'locations', 25,
      jsonb_build_object('origin', 'location_intelligence_post_import', 'automatic', true),
      clock_timestamp(), clock_timestamp()
    ) returning * into v_run;
  end if;

  with selected as (
    select i.location_id
    from public.location_intelligence_inbox i
    where i.status = 'queued' and i.next_attempt_at <= clock_timestamp()
    order by i.created_at asc
    limit greatest(1, least(coalesce(p_limit,25),25))
    for update skip locked
  ), inserted as (
    insert into public.location_enrichment_run_items(run_id, location_id, status, priority, reasons)
    select v_run.id, s.location_id, 'pending', 5, array['post_import']::text[]
    from selected s
    on conflict (run_id, location_id) do nothing
    returning location_id
  ), updated as (
    update public.location_intelligence_inbox i
    set status = 'attached',
        run_id = v_run.id,
        attempts = i.attempts + 1,
        last_error = null,
        updated_at = clock_timestamp()
    where i.location_id in (select location_id from selected)
    returning i.location_id
  )
  select count(*) into v_attached from updated;

  select coalesce(sum(case when l.google_place_id is null then 2 else 1 end),0)
    into v_calls
  from public.location_intelligence_inbox i
  join public.locations l on l.id = i.location_id
  where i.run_id = v_run.id and i.status = 'attached';

  update public.location_enrichment_runs
  set estimated_records = (
        select count(*) from public.location_enrichment_run_items where run_id = v_run.id
      ),
      estimated_api_calls = v_calls,
      updated_at = clock_timestamp()
  where id = v_run.id;

  return jsonb_build_object('attached', v_attached, 'runId', v_run.id, 'status', v_run.status);
end;
$$;

revoke all on function public.attach_location_intelligence_inbox(integer)
  from public, anon, authenticated;
grant execute on function public.attach_location_intelligence_inbox(integer) to service_role;

create or replace function private.signal_post_import_inbox_after_run_terminal()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  if old.status in ('planned','queued','running')
    and new.status in ('completed','cancelled','failed','budget_stopped')
    and exists (
      select 1 from public.location_intelligence_inbox
      where status = 'queued' and next_attempt_at <= clock_timestamp()
    )
  then
    perform private.emit_aws_background_work_signal('catalog-enrichment-runner', interval '1 second');
  end if;
  return new;
end;
$$;

revoke all on function private.signal_post_import_inbox_after_run_terminal()
  from public, anon, authenticated;

drop trigger if exists trg_signal_post_import_inbox_after_run_terminal on public.location_enrichment_runs;
create trigger trg_signal_post_import_inbox_after_run_terminal
after update of status on public.location_enrichment_runs
for each row execute function private.signal_post_import_inbox_after_run_terminal();
