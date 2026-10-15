-- Worker claims are serialized with operator commands and only claim funded queued runs.
create or replace function public.li_v2_claim_campaign_run()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v record;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 select r.* into v from private.li_v2_campaign_import_runs r
 where r.status='queued' and r.requested_action='run'
 and exists(select 1 from private.location_acquisition_budget_caps c where c.scope='campaign' and c.scope_id=r.campaign_id and c.enabled and now()>=c.period_start and now()<c.period_end)
 and exists(select 1 from private.location_acquisition_budget_caps g where g.scope='global' and g.scope_id='all' and g.enabled and now()>=g.period_start and now()<g.period_end)
 order by r.created_at for update skip locked limit 1;
 if not found then return null; end if;
 update private.li_v2_campaign_import_runs set status='running',started_at=coalesce(started_at,now()),updated_at=now() where id=v.id;
 return jsonb_build_object('id',v.id,'campaign_id',v.campaign_id,'processed',v.processed);
end;$$;
revoke all on function public.li_v2_claim_campaign_run() from public,anon,authenticated;
grant execute on function public.li_v2_claim_campaign_run() to service_role;

create or replace function public.li_v2_campaign_run_checkpoint(p_run_id uuid,p_processed integer,p_discovered integer,p_failed integer,p_status text default 'running',p_error text default null,p_published integer default 0)
returns boolean language plpgsql security definer set search_path='' as $$
declare v record;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_processed < 0 or p_discovered < 0 or p_failed < 0 or p_published < 0 or p_status not in ('running','completed','failed') then raise exception 'invalid_run_checkpoint'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 select * into v from private.li_v2_campaign_import_runs where id=p_run_id for update;
 if not found or v.status <> 'running' or v.requested_action <> 'run' then return false; end if;
 update private.li_v2_campaign_import_runs set processed=processed+p_processed, discovered=discovered+p_discovered,
 failed=failed+p_failed,published=published+p_published,status=p_status,last_error=p_error,updated_at=now(),
 finished_at=case when p_status in ('completed','failed') then now() else finished_at end
 where id=p_run_id;
 return true;
end;$$;
revoke all on function public.li_v2_campaign_run_checkpoint(uuid,integer,integer,integer,text,text,integer) from public,anon,authenticated;
grant execute on function public.li_v2_campaign_run_checkpoint(uuid,integer,integer,integer,text,text,integer) to service_role;
