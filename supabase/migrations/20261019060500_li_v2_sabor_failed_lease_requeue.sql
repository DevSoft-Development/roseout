-- Service-role-only, one-time recovery of the verified Sabor bootstrap lease failure.
-- Does not submit a provider request or change spending ledgers.
create or replace function public.li_v2_requeue_verified_sabor_failed_lease()
returns boolean language plpgsql security definer set search_path='' as $$
declare v record;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 select * into v from private.li_v2_campaign_import_runs
 where id='dba50b2b-de14-4672-81fa-99e21fe3cad7'::uuid for update;
 if not found or v.status <> 'failed'
   or v.last_error <> 'worker_lease_expired_manual_reconciliation_required'
   or v.processed <> 1 or v.published <> 1 or v.failed <> 4
   or v.requested_action <> 'run' then return false; end if;
 if (select count(*) from private.li_v2_maps_queue
     where campaign_run_id=v.id) <> 1 then return false; end if;
 if not exists(select 1 from private.li_v2_maps_queue
     where campaign_run_id=v.id and target_index=0 and status='reviewed') then return false; end if;
 if not exists(select 1 from private.li_v2_consumer_retrieval_checks c
     join public.locations l on l.id=c.location_id
     where c.run_id=v.id and l.id='05f4f24d-6906-4420-86b0-a4c734654aac'::uuid
       and l.import_source='li_v2_independent' and l.is_searchable=true
       and l.publish_ready=true and l.quality_status='publish_ready'
       and l.active=true and l.is_hidden=false and l.deleted_at is null
       and l.has_photos=true and l.duplicate_status='unique') then return false; end if;
 update private.li_v2_campaign_import_runs
 set status='queued',last_error=null,finished_at=null,updated_at=now()
 where id=v.id;
 return true;
end;$$;
revoke all on function public.li_v2_requeue_verified_sabor_failed_lease() from public,anon,authenticated;
grant execute on function public.li_v2_requeue_verified_sabor_failed_lease() to service_role;
