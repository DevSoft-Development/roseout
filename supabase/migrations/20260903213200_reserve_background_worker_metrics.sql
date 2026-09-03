-- Durable Reserve background outbox claiming and daily service metrics.

create table if not exists public.reserve_service_metrics_daily (
  location_id uuid not null,
  service_date date not null,
  seated_parties integer not null default 0,
  seated_covers integer not null default 0,
  waitlist_parties_seated integer not null default 0,
  automatic_server_assignments integer not null default 0,
  manager_overrides integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (location_id, service_date)
);

alter table public.reserve_service_metrics_daily enable row level security;
revoke all on table public.reserve_service_metrics_daily from anon, authenticated;
grant select, insert, update, delete on table public.reserve_service_metrics_daily to service_role;

create or replace function public.reserve_claim_background_outbox(
  p_limit integer default 25
) returns setof public.reserve_background_outbox
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  with claimed as (
    select id
    from public.reserve_background_outbox
    where status in ('pending','failed')
      and available_at <= now()
      and attempts < 8
    order by available_at, created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,25),100))
  )
  update public.reserve_background_outbox o
     set status = 'processing',
         attempts = o.attempts + 1,
         updated_at = now(),
         last_error = null
    from claimed
   where o.id = claimed.id
  returning o.*;
end;
$$;

revoke all on function public.reserve_claim_background_outbox(integer) from public, anon, authenticated;
grant execute on function public.reserve_claim_background_outbox(integer) to service_role;

create or replace function public.reserve_complete_background_outbox(
  p_id uuid
) returns void
language sql
security invoker
set search_path = public
as $$
  update public.reserve_background_outbox
     set status = 'completed', updated_at = now(), last_error = null
   where id = p_id;
$$;

revoke all on function public.reserve_complete_background_outbox(uuid) from public, anon, authenticated;
grant execute on function public.reserve_complete_background_outbox(uuid) to service_role;

create or replace function public.reserve_fail_background_outbox(
  p_id uuid,
  p_error text,
  p_delay_seconds integer default 60
) returns void
language sql
security invoker
set search_path = public
as $$
  update public.reserve_background_outbox
     set status = 'failed',
         available_at = now() + make_interval(secs => greatest(30,least(coalesce(p_delay_seconds,60),3600))),
         updated_at = now(),
         last_error = left(coalesce(p_error,'Reserve background event failed'),1000)
   where id = p_id;
$$;

revoke all on function public.reserve_fail_background_outbox(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_fail_background_outbox(uuid,text,integer) to service_role;

create or replace function public.reserve_increment_daily_metric(
  p_location_id uuid,
  p_service_date date,
  p_metric text,
  p_amount integer default 1
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  amount integer := greatest(0,coalesce(p_amount,0));
begin
  insert into public.reserve_service_metrics_daily(location_id,service_date)
  values (p_location_id,p_service_date)
  on conflict (location_id,service_date) do nothing;

  if p_metric = 'seated_parties' then
    update public.reserve_service_metrics_daily set seated_parties = seated_parties + amount, updated_at = now() where location_id=p_location_id and service_date=p_service_date;
  elsif p_metric = 'seated_covers' then
    update public.reserve_service_metrics_daily set seated_covers = seated_covers + amount, updated_at = now() where location_id=p_location_id and service_date=p_service_date;
  elsif p_metric = 'waitlist_parties_seated' then
    update public.reserve_service_metrics_daily set waitlist_parties_seated = waitlist_parties_seated + amount, updated_at = now() where location_id=p_location_id and service_date=p_service_date;
  elsif p_metric = 'automatic_server_assignments' then
    update public.reserve_service_metrics_daily set automatic_server_assignments = automatic_server_assignments + amount, updated_at = now() where location_id=p_location_id and service_date=p_service_date;
  elsif p_metric = 'manager_overrides' then
    update public.reserve_service_metrics_daily set manager_overrides = manager_overrides + amount, updated_at = now() where location_id=p_location_id and service_date=p_service_date;
  else
    raise exception 'Unsupported Reserve metric: %', p_metric;
  end if;
end;
$$;

revoke all on function public.reserve_increment_daily_metric(uuid,date,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_increment_daily_metric(uuid,date,text,integer) to service_role;
