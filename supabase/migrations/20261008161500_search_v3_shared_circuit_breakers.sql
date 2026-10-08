-- toh:replicated-dml-reviewed
-- Review: Virginia is the authoritative write region; migration executes DDL only.
-- The INSERT/UPDATE statements are inside functions scoped exclusively to the newly
-- created search_v3_lane_breakers table, not executed during migration replay.
-- Oregon migration replay therefore does not perform origin DML from this file.
-- Six-lane Search V3 distributed circuit breaker.
-- Server-side service role only. Never expose these RPCs to clients.
create table if not exists public.search_v3_lane_breakers (
  lane_id text primary key check (lane_id in (
    'structured','bm25','semantic_dense_li','food_semantic','menu_semantic','review_intelligence'
  )),
  failures integer not null default 0,
  open_until timestamptz,
  probe_lease uuid,
  probe_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.search_v3_lane_breakers enable row level security;
revoke all on public.search_v3_lane_breakers from public, anon, authenticated;

create or replace function public.search_v3_breaker_enter(
  p_lane text, p_cooldown_ms integer
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.search_v3_lane_breakers%rowtype; token uuid;
begin
  if p_lane not in ('structured','bm25','semantic_dense_li','food_semantic','menu_semantic','review_intelligence')
    or p_cooldown_ms < 1000 or p_cooldown_ms > 3600000 then
    raise exception 'invalid_search_v3_breaker_request';
  end if;
  insert into public.search_v3_lane_breakers(lane_id) values(p_lane)
    on conflict (lane_id) do nothing;
  select * into v from public.search_v3_lane_breakers where lane_id=p_lane for update;
  if v.open_until is not null and v.open_until > clock_timestamp() then
    return null;
  end if;
  if v.probe_until is not null and v.probe_until > clock_timestamp() then
    return null;
  end if;
  if v.open_until is not null then
    token:=gen_random_uuid();
    update public.search_v3_lane_breakers
       set probe_lease=token, probe_until=clock_timestamp()+interval '30 seconds', updated_at=clock_timestamp()
     where lane_id=p_lane;
    return token;
  end if;
  -- All ordinary closed-state requests use the nil UUID.
  return '00000000-0000-0000-0000-000000000000'::uuid;
end; $$;

create or replace function public.search_v3_breaker_finish(
 p_lane text, p_token uuid, p_success boolean, p_threshold integer, p_cooldown_ms integer
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.search_v3_lane_breakers%rowtype; failed integer; is_probe boolean;
begin
 if p_lane not in ('structured','bm25','semantic_dense_li','food_semantic','menu_semantic','review_intelligence')
    or p_token is null or p_threshold < 1 or p_threshold > 100
    or p_cooldown_ms < 1000 or p_cooldown_ms > 3600000 then
   raise exception 'invalid_search_v3_breaker_request';
 end if;
 select * into v from public.search_v3_lane_breakers where lane_id=p_lane for update;
 if not found then return; end if;
 is_probe:=p_token <> '00000000-0000-0000-0000-000000000000'::uuid;
 if is_probe and v.probe_lease is distinct from p_token then return; end if;
 if not is_probe and (v.open_until is not null or v.probe_lease is not null) then return; end if;
 if p_success then
   update public.search_v3_lane_breakers
     set failures=0,open_until=null,probe_lease=null,probe_until=null,updated_at=clock_timestamp()
    where lane_id=p_lane;
 else
   failed:=v.failures+1;
   update public.search_v3_lane_breakers
      set failures=failed,
          open_until=case when is_probe or failed>=p_threshold
             then clock_timestamp()+(p_cooldown_ms::text || ' milliseconds')::interval else null end,
          probe_lease=null,probe_until=null,updated_at=clock_timestamp()
    where lane_id=p_lane;
 end if;
end; $$;

revoke all on function public.search_v3_breaker_enter(text, integer) from public, anon, authenticated;
revoke all on function public.search_v3_breaker_finish(text, uuid, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.search_v3_breaker_enter(text, integer) to service_role;
grant execute on function public.search_v3_breaker_finish(text, uuid, boolean, integer, integer) to service_role;
grant select on public.search_v3_lane_breakers to service_role;
