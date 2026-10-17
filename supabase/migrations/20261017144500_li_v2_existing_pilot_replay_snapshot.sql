-- Read-only service-role-only lookup for the previously purchased LI V2 pilot.
-- Do not expose private tables to the Data API or change campaign state.
create or replace function public.li_v2_existing_pilot_replay_snapshot(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.li_v2_campaign_import_runs%rowtype;
  v_queue jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_run_id <> 'f575c139-1e94-4ca9-9916-a9f6306f5f36'::uuid then
    raise exception 'replay_run_not_allowed';
  end if;
  select * into v_run from private.li_v2_campaign_import_runs where id = p_run_id;
  if not found or v_run.campaign_id <> 'li-v2-pilot-001'
     or v_run.status not in ('failed','queued')
     or v_run.processed <> 0
     or v_run.recovery_count <> 2
     or v_run.requested_action <> 'run'
     or (v_run.status = 'failed' and v_run.last_error <> 'no_published_locations_to_certify') then
    raise exception 'existing_pilot_run_not_eligible';
  end if;
  if (select count(*) from private.li_v2_maps_queue where campaign_run_id = p_run_id) <> 1 then
    raise exception 'existing_paid_ready_task_required';
  end if;
  select jsonb_build_object('task_id',task_id,'target_index',target_index)
    into v_queue from private.li_v2_maps_queue
    where campaign_run_id = p_run_id and target_index = 0
      and status = 'ready' and task_id is not null;
  if v_queue is null then
    raise exception 'existing_paid_ready_task_required';
  end if;
  return v_queue;
end
$$;
revoke all on function public.li_v2_existing_pilot_replay_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.li_v2_existing_pilot_replay_snapshot(uuid) to service_role;
