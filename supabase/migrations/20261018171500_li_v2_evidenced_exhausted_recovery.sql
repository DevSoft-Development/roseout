-- One-time evidence-backed recovery of Sabor's exhausted consumer retrieval check.
-- The public consumer proof must be reviewed before applying this migration.
create table if not exists private.li_v2_consumer_proof_recovery_audit (
 id bigint generated always as identity primary key,
 run_id uuid not null,
 target_index integer not null,
 location_id uuid not null,
 prior_status text not null,
 prior_attempts integer not null,
 prior_campaign_status text not null,
 prior_campaign_failures integer not null,
 proof_url text not null,
 proof_commit text not null,
 recorded_at timestamptz not null default now(),
 unique(run_id,target_index,location_id)
);
revoke all on private.li_v2_consumer_proof_recovery_audit from public, anon, authenticated;

create or replace function public.li_v2_certify_exhausted_with_public_proof(
 p_run_id uuid, p_index integer, p_location_id uuid, p_proof_url text, p_proof_commit text
) returns boolean language plpgsql security definer set search_path='' as $$
declare v private.li_v2_consumer_retrieval_checks%rowtype;
        c private.li_v2_campaign_import_runs%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 if p_run_id <> 'dba50b2b-de14-4672-81fa-99e21fe3cad7'::uuid
  or p_location_id <> '05f4f24d-6906-4420-86b0-a4c734654aac'::uuid or p_index <> 0
  or p_proof_url <> 'https://github.com/DevSoft-Development/roseout/actions/runs/39137186860'
  or p_proof_commit <> '44d0cd55007f9f0166965b1b1eb1c39e1c67cf93' then return false; end if;
 select * into v from private.li_v2_consumer_retrieval_checks
  where run_id=p_run_id and target_index=p_index and location_id=p_location_id for update;
 if not found or v.status <> 'quarantined' or v.attempts <> 12 then return false; end if;
 select * into c from private.li_v2_campaign_import_runs where id=p_run_id for update;
 if not found or c.status <> 'failed' or c.failed <> 4 or
   c.last_error <> 'all_consumer_retrieval_checks_quarantined' then return false; end if;
 if not exists(select 1 from public.locations l where l.id=p_location_id
   and l.import_source='li_v2_independent' and l.is_searchable=true
   and l.publish_ready=true and l.quality_status='publish_ready'
   and l.active=true and l.is_hidden=false and l.has_photos=true
   and l.duplicate_status='unique' and l.data_status='clean') then return false; end if;
 insert into private.li_v2_consumer_proof_recovery_audit
 (run_id,target_index,location_id,prior_status,prior_attempts,
  prior_campaign_status,prior_campaign_failures,proof_url,proof_commit)
 values(p_run_id,p_index,p_location_id,v.status,v.attempts,c.status,c.failed,p_proof_url,p_proof_commit)
 on conflict do nothing;
 if not found then return false; end if;
 update private.li_v2_consumer_retrieval_checks set status='verified',
   verified_at=now(),last_error=null,updated_at=now()
 where run_id=p_run_id and target_index=p_index and location_id=p_location_id;
 update private.li_v2_campaign_import_runs set status='queued',
   finished_at=null,updated_at=now() where id=p_run_id;
 return true;
end $$;
revoke all on function public.li_v2_certify_exhausted_with_public_proof(uuid,integer,uuid,text,text) from public, anon, authenticated;
grant execute on function public.li_v2_certify_exhausted_with_public_proof(uuid,integer,uuid,text,text) to service_role;
