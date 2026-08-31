-- Align the Phase 5 CRM sequence claim RPC with the canonical crm_sequence_steps schema.
-- crm_sequence_steps uses delay_config (not the removed configuration column).
-- Use the named unique constraint to avoid PL/pgSQL output-variable ambiguity in ON CONFLICT.

create or replace function public.crm_claim_due_sequence_enrollments(
  p_worker_id text,
  p_limit integer,
  p_lease_seconds integer
)
returns table(
  enrollment_id uuid,
  sequence_id uuid,
  step_id uuid,
  step_order integer,
  step_type text,
  step_config jsonb,
  execution_id uuid,
  execution_key text,
  attempt_count integer,
  lease_recovered boolean
)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if nullif(trim(p_worker_id),'') is null then
    raise exception 'worker id required';
  end if;

  return query
  with due as (
    select
      e.id,
      e.sequence_id,
      e.current_step_order,
      s.id as step_id,
      s.step_type,
      s.delay_config
    from crm_sequence_enrollments e
    join crm_sequences q
      on q.id=e.sequence_id
     and q.status='active'
    join crm_sequence_steps s
      on s.sequence_id=e.sequence_id
     and s.step_order=e.current_step_order
    left join crm_sequence_step_executions x
      on x.enrollment_id=e.id
     and x.step_order=e.current_step_order
     and x.generation=1
    where e.status='active'
      and e.next_step_at<=now()
      and (
        x.id is null
        or (
          x.status in ('pending','retry_scheduled','claimed','processing')
          and coalesce(x.next_retry_at,'-infinity')<=now()
          and (x.lease_expires_at is null or x.lease_expires_at<now())
        )
      )
    order by e.next_step_at,e.id
    for update of e skip locked
    limit greatest(1,least(p_limit,250))
  ), upserted as (
    insert into crm_sequence_step_executions(
      execution_key,enrollment_id,sequence_id,step_id,step_order,status,
      claimed_by,claimed_at,lease_expires_at,attempt_count,metadata
    )
    select
      d.id||':'||d.current_step_order||':1',
      d.id,
      d.sequence_id,
      d.step_id,
      d.current_step_order,
      'claimed',
      p_worker_id,
      now(),
      now()+make_interval(secs=>greatest(30,least(p_lease_seconds,3600))),
      1,
      jsonb_build_object('lease_recovered',false)
    from due d
    on conflict on constraint crm_sequence_step_executions_enrollment_id_step_order_gener_key
    do update set
      status='claimed',
      claimed_by=p_worker_id,
      claimed_at=now(),
      lease_expires_at=now()+make_interval(secs=>greatest(30,least(p_lease_seconds,3600))),
      attempt_count=crm_sequence_step_executions.attempt_count+1,
      metadata=crm_sequence_step_executions.metadata||jsonb_build_object(
        'lease_recovered',crm_sequence_step_executions.lease_expires_at<now(),
        'recovered_at',case when crm_sequence_step_executions.lease_expires_at<now() then now() end
      )
    returning *
  )
  select
    u.enrollment_id,
    u.sequence_id,
    u.step_id,
    u.step_order,
    d.step_type,
    coalesce(d.delay_config,'{}'::jsonb),
    u.id,
    u.execution_key,
    u.attempt_count,
    coalesce((u.metadata->>'lease_recovered')::boolean,false)
  from upserted u
  join due d on d.id=u.enrollment_id;
end
$$;

revoke all on function public.crm_claim_due_sequence_enrollments(text,integer,integer)
  from public,anon,authenticated;
grant execute on function public.crm_claim_due_sequence_enrollments(text,integer,integer)
  to service_role;
