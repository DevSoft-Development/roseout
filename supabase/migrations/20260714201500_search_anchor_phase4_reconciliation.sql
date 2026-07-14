create table if not exists public.search_anchor_reconciliation_queue (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  event_type text not null default 'update',
  reason_code text not null default 'location_changed',
  status text not null default 'pending',
  priority integer not null default 50,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  processed_at timestamptz,
  last_error text,
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint search_anchor_reconciliation_event_type_check check (event_type in ('insert','update','delete','manual','nightly_reconciliation')),
  constraint search_anchor_reconciliation_status_check check (status in ('pending','processing','completed','failed','dead_letter','cancelled')),
  constraint search_anchor_reconciliation_attempts_check check (attempts >= 0 and max_attempts between 1 and 20),
  constraint search_anchor_reconciliation_priority_check check (priority between 0 and 100)
);

create unique index if not exists search_anchor_reconciliation_active_location_unique
  on public.search_anchor_reconciliation_queue(location_id)
  where status in ('pending','processing');
create index if not exists search_anchor_reconciliation_pending_idx
  on public.search_anchor_reconciliation_queue(status, available_at, priority desc, created_at);
create index if not exists search_anchor_reconciliation_location_idx
  on public.search_anchor_reconciliation_queue(location_id);

create or replace function public.search_anchor_reconciliation_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists search_anchor_reconciliation_updated_at on public.search_anchor_reconciliation_queue;
create trigger search_anchor_reconciliation_updated_at
before update on public.search_anchor_reconciliation_queue
for each row execute function public.search_anchor_reconciliation_set_updated_at();

create or replace function public.enqueue_search_anchor_reconciliation(
  p_location_id uuid,
  p_event_type text default 'update',
  p_reason_code text default 'location_changed',
  p_priority integer default 50,
  p_source_updated_at timestamptz default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.search_anchor_reconciliation_queue (
    location_id, event_type, reason_code, status, priority, attempts,
    available_at, locked_at, locked_by, processed_at, last_error,
    source_updated_at, payload
  ) values (
    p_location_id, p_event_type, p_reason_code, 'pending',
    greatest(0, least(coalesce(p_priority, 50), 100)), 0,
    now(), null, null, null, null, p_source_updated_at,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (location_id) where status in ('pending','processing')
  do update set
    event_type = excluded.event_type,
    reason_code = excluded.reason_code,
    priority = greatest(public.search_anchor_reconciliation_queue.priority, excluded.priority),
    status = 'pending',
    available_at = now(),
    locked_at = null,
    locked_by = null,
    processed_at = null,
    last_error = null,
    source_updated_at = excluded.source_updated_at,
    payload = public.search_anchor_reconciliation_queue.payload || excluded.payload,
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.queue_location_search_anchor_reconciliation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.enqueue_search_anchor_reconciliation(old.id, 'delete', 'location_deleted', 100, old.updated_at, jsonb_build_object('market', old.market));
    return old;
  end if;

  perform public.enqueue_search_anchor_reconciliation(
    new.id,
    case when tg_op = 'INSERT' then 'insert' else 'update' end,
    case when tg_op = 'INSERT' then 'location_created' else 'location_updated' end,
    case when tg_op = 'INSERT' then 70 else 60 end,
    new.updated_at,
    jsonb_build_object('market', new.market)
  );
  return new;
end;
$$;

drop trigger if exists locations_queue_search_anchor_reconciliation on public.locations;
create trigger locations_queue_search_anchor_reconciliation
after insert or update or delete on public.locations
for each row execute function public.queue_location_search_anchor_reconciliation();

create or replace function public.claim_search_anchor_reconciliation_batch(
  p_limit integer default 100,
  p_worker text default 'search-anchor-reconciliation'
)
returns setof public.search_anchor_reconciliation_queue
language plpgsql security definer set search_path = public as $$
begin
  return query
  with claimable as (
    select q.id
    from public.search_anchor_reconciliation_queue q
    where q.status in ('pending','failed')
      and q.available_at <= now()
      and q.attempts < q.max_attempts
      and (q.locked_at is null or q.locked_at < now() - interval '15 minutes')
    order by q.priority desc, q.available_at asc, q.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 250))
  )
  update public.search_anchor_reconciliation_queue q
  set status = 'processing', attempts = q.attempts + 1,
      locked_at = now(), locked_by = coalesce(nullif(trim(p_worker), ''), 'search-anchor-reconciliation'),
      last_error = null, updated_at = now()
  from claimable
  where q.id = claimable.id
  returning q.*;
end;
$$;

create or replace function public.complete_search_anchor_reconciliation(
  p_queue_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.search_anchor_reconciliation_queue
  set status = 'completed', processed_at = now(), locked_at = null, locked_by = null,
      last_error = null, payload = payload || coalesce(p_payload, '{}'::jsonb), updated_at = now()
  where id = p_queue_id;
  return found;
end;
$$;

create or replace function public.fail_search_anchor_reconciliation(
  p_queue_id uuid,
  p_error text,
  p_retry_minutes integer default 15
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.search_anchor_reconciliation_queue
  set status = case when attempts >= max_attempts then 'dead_letter' else 'failed' end,
      available_at = case when attempts >= max_attempts then available_at else now() + make_interval(mins => greatest(1, least(coalesce(p_retry_minutes, 15), 1440))) end,
      locked_at = null, locked_by = null,
      last_error = left(coalesce(p_error, 'Unknown reconciliation error'), 4000), updated_at = now()
  where id = p_queue_id;
  return found;
end;
$$;

create or replace function public.release_stale_search_anchor_reconciliation_locks(
  p_stale_minutes integer default 15
)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.search_anchor_reconciliation_queue
  set status = case when attempts >= max_attempts then 'dead_letter' else 'failed' end,
      available_at = now(), locked_at = null, locked_by = null,
      last_error = coalesce(last_error, 'Processing lock expired before completion.'), updated_at = now()
  where status = 'processing'
    and locked_at < now() - make_interval(mins => greatest(1, least(coalesce(p_stale_minutes, 15), 1440)));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.queue_stale_search_anchor_locations(p_limit integer default 1000)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  with candidates as (
    select l.id, l.updated_at, l.market
    from public.locations l
    left join public.search_anchors a on a.linked_location_id = l.id
    where a.id is null or a.source_updated_at is distinct from l.updated_at or a.sync_status is distinct from 'current'
    order by l.updated_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 1000), 10000))
  ), queued as (
    insert into public.search_anchor_reconciliation_queue (
      location_id, event_type, reason_code, status, priority, source_updated_at, payload
    )
    select id, 'nightly_reconciliation', 'anchor_missing_or_stale', 'pending', 40, updated_at,
           jsonb_build_object('market', market)
    from candidates
    on conflict (location_id) where status in ('pending','processing')
    do update set status = 'pending', available_at = now(), source_updated_at = excluded.source_updated_at,
                  payload = public.search_anchor_reconciliation_queue.payload || excluded.payload, updated_at = now()
    returning 1
  )
  select count(*) into v_count from queued;
  return v_count;
end;
$$;

create or replace function public.disable_orphaned_search_anchors()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.search_anchors a
  set is_active = false, is_searchable = false, review_status = 'disabled',
      sync_status = 'disabled_source', last_synced_at = now(),
      metadata = coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object('disabled_reason', 'linked_location_missing', 'disabled_at', now())
  where a.source_type = 'linked_location'
    and a.linked_location_id is not null
    and not exists (select 1 from public.locations l where l.id = a.linked_location_id)
    and (a.is_active or a.is_searchable or a.review_status is distinct from 'disabled');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

alter table public.search_anchor_reconciliation_queue enable row level security;
drop policy if exists search_anchor_reconciliation_admin_all on public.search_anchor_reconciliation_queue;
create policy search_anchor_reconciliation_admin_all
on public.search_anchor_reconciliation_queue
for all to authenticated
using (public.search_anchor_is_admin())
with check (public.search_anchor_is_admin());

grant all on public.search_anchor_reconciliation_queue to service_role;
grant select on public.search_anchor_reconciliation_queue to authenticated;
grant execute on function public.enqueue_search_anchor_reconciliation(uuid,text,text,integer,timestamptz,jsonb) to service_role;
grant execute on function public.claim_search_anchor_reconciliation_batch(integer,text) to service_role;
grant execute on function public.complete_search_anchor_reconciliation(uuid,jsonb) to service_role;
grant execute on function public.fail_search_anchor_reconciliation(uuid,text,integer) to service_role;
grant execute on function public.release_stale_search_anchor_reconciliation_locks(integer) to service_role;
grant execute on function public.queue_stale_search_anchor_locations(integer) to service_role;
grant execute on function public.disable_orphaned_search_anchors() to service_role;
