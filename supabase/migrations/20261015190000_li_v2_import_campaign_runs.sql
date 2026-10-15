-- Operator lifecycle with durable progress. No worker is implicitly started by changing a budget.
create table if not exists private.li_v2_campaign_import_runs(
 id uuid primary key default gen_random_uuid(),
 campaign_id text not null check(campaign_id ~ '^[a-zA-Z0-9:_-]{6,100}$'),
 status text not null check(status in ('queued','running','paused','cancelled','completed','failed')),
 requested_action text not null default 'run' check(requested_action in ('run','pause','cancel')),
 processed integer not null default 0 check(processed>=0),
 discovered integer not null default 0 check(discovered>=0),
 published integer not null default 0 check(published>=0),
 failed integer not null default 0 check(failed>=0),
 last_error text,
 started_at timestamptz,
 finished_at timestamptz,
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create unique index if not exists li_v2_one_active_campaign_run on private.li_v2_campaign_import_runs(campaign_id)
 where status in ('queued','running','paused');
create index if not exists li_v2_campaign_recent_runs on private.li_v2_campaign_import_runs(created_at desc);
create or replace function public.admin_li_v2_import_command(p_campaign_id text,p_action text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_run private.li_v2_campaign_import_runs%rowtype; v_id uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_campaign_id !~ '^[a-zA-Z0-9:_-]{6,100}$' or p_action not in ('start','pause','resume','cancel') then
 raise exception 'invalid_import_command'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 select * into v_run from private.li_v2_campaign_import_runs
 where campaign_id=p_campaign_id and status in ('queued','running','paused')
 order by created_at desc limit 1 for update;
 if p_action='start' then
   if found then raise exception 'campaign_already_active'; end if;
   if not exists(select 1 from private.location_acquisition_budget_caps c where c.scope='campaign'
     and c.scope_id=p_campaign_id and c.enabled and now() between c.period_start and c.period_end)
     or not exists(select 1 from private.location_acquisition_budget_caps g where g.scope='global'
     and g.scope_id='all' and g.enabled and now() between g.period_start and g.period_end) then
     raise exception 'campaign_budget_inactive';
   end if;
   insert into private.li_v2_campaign_import_runs(campaign_id,status) values(p_campaign_id,'queued') returning id into v_id;
 elsif not found then raise exception 'no_active_campaign_run';
 elsif p_action='pause' then
   if v_run.status not in ('queued','running') then raise exception 'campaign_not_running'; end if;
   update private.li_v2_campaign_import_runs set requested_action='pause',status='paused',updated_at=now() where id=v_run.id;
   v_id:=v_run.id;
 elsif p_action='resume' then
   if v_run.status<>'paused' then raise exception 'campaign_not_paused'; end if;
   update private.li_v2_campaign_import_runs set requested_action='run',status='queued',updated_at=now() where id=v_run.id;
   v_id:=v_run.id;
 else
   update private.li_v2_campaign_import_runs set requested_action='cancel',status='cancelled',
     finished_at=now(),updated_at=now() where id=v_run.id;
   v_id:=v_run.id;
 end if;
 return v_id;
end;$$;
revoke all on function public.admin_li_v2_import_command(text,text) from public,anon,authenticated;
grant execute on function public.admin_li_v2_import_command(text,text) to service_role;
create or replace function public.admin_li_v2_import_runs()
returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc),'[]'::jsonb)
from (select id,campaign_id,status,requested_action,processed,discovered,published,failed,last_error,started_at,finished_at,updated_at,created_at
from private.li_v2_campaign_import_runs order by created_at desc limit 30) r;
$$;
revoke all on function public.admin_li_v2_import_runs() from public,anon,authenticated;
grant execute on function public.admin_li_v2_import_runs() to service_role;
