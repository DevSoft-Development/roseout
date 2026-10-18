-- Reconcile published-location accounting from durable LI V2 evidence.
-- Idempotent: a retry cannot increment the same location twice.
create or replace function public.li_v2_reconcile_campaign_published(p_run_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 if not exists(select 1 from private.li_v2_campaign_import_runs where id=p_run_id) then
   return null;
 end if;
 select count(distinct c.location_id)::integer into n
 from private.li_v2_consumer_retrieval_checks c
 join public.locations l on l.id=c.location_id
 where c.run_id=p_run_id and l.import_source='li_v2_independent'
   and l.is_searchable=true and l.publish_ready=true
   and l.quality_status='publish_ready' and l.active=true
   and l.is_hidden=false and l.deleted_at is null
   and l.has_photos=true and l.duplicate_status='unique';
 update private.li_v2_campaign_import_runs
 set published=greatest(published,n),updated_at=now()
 where id=p_run_id and published<n;
 return n;
end $$;
revoke all on function public.li_v2_reconcile_campaign_published(uuid) from public,anon,authenticated;
grant execute on function public.li_v2_reconcile_campaign_published(uuid) to service_role;
