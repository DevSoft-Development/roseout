-- CRM Phase 5 automation. Additive; automation is intentionally disabled on deploy.
create table public.crm_automation_settings (
  singleton boolean primary key default true check (singleton),
  automation_enabled boolean not null default false,
  email_automation_enabled boolean not null default false,
  task_automation_enabled boolean not null default true,
  batch_size integer not null default 25 check (batch_size between 1 and 250),
  lease_seconds integer not null default 300 check (lease_seconds between 30 and 3600),
  max_attempts integer not null default 4 check (max_attempts between 1 and 10),
  contact_daily_email_limit integer not null default 1 check (contact_daily_email_limit >= 0),
  contact_weekly_email_limit integer not null default 3 check (contact_weekly_email_limit >= 0),
  quiet_hours_enabled boolean not null default true,
  default_timezone text not null default 'America/New_York',
  emergency_stop_reason text,
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);
insert into public.crm_automation_settings(singleton) values(true) on conflict do nothing;

create table public.crm_automation_runs (
  id uuid primary key default gen_random_uuid(), worker_id text not null, trigger_source text not null default 'cron',
  status text not null default 'running' check(status in ('running','disabled','completed','failed')),
  started_at timestamptz not null default now(), finished_at timestamptz,
  claimed_count integer not null default 0, completed_count integer not null default 0,
  waiting_count integer not null default 0, approval_count integer not null default 0,
  retry_count integer not null default 0, suppressed_count integer not null default 0,
  exited_count integer not null default 0, failed_count integer not null default 0,
  skipped_count integer not null default 0, error_summary jsonb not null default '[]',
  metadata jsonb not null default '{}', created_at timestamptz not null default now()
);

create table public.crm_sequence_step_executions (
  id uuid primary key default gen_random_uuid(), execution_key text not null unique,
  enrollment_id uuid not null references public.crm_sequence_enrollments(id) on delete cascade,
  sequence_id uuid not null references public.crm_sequences(id),
  step_id uuid not null references public.crm_sequence_steps(id), step_order integer not null check(step_order > 0),
  generation integer not null default 1 check(generation > 0),
  status text not null default 'pending' check(status in ('pending','claimed','processing','waiting','pending_approval','completed','retry_scheduled','failed','suppressed','skipped','cancelled')),
  attempt_count integer not null default 0 check(attempt_count >= 0),
  claimed_by text, claimed_at timestamptz, lease_expires_at timestamptz,
  started_at timestamptz, completed_at timestamptz, failed_at timestamptz, next_retry_at timestamptz,
  message_id uuid references public.crm_messages(id) on delete set null,
  task_id uuid references public.crm_tasks(id) on delete set null,
  approval_id uuid references public.crm_communication_approvals(id) on delete set null,
  error_code text, error_message text, input_snapshot jsonb not null default '{}',
  result_snapshot jsonb not null default '{}', metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(enrollment_id, step_order, generation)
);
create index crm_step_exec_due_idx on public.crm_sequence_step_executions(status,next_retry_at);
create index crm_step_exec_enrollment_idx on public.crm_sequence_step_executions(enrollment_id,step_order);
create index crm_step_exec_lease_idx on public.crm_sequence_step_executions(lease_expires_at);
create index crm_step_exec_sequence_idx on public.crm_sequence_step_executions(sequence_id);
create index crm_step_exec_created_idx on public.crm_sequence_step_executions(created_at desc);
create index crm_step_exec_failed_idx on public.crm_sequence_step_executions(failed_at desc) where status='failed';
create index crm_step_exec_approval_idx on public.crm_sequence_step_executions(approval_id) where status='pending_approval';
create index crm_automation_runs_created_idx on public.crm_automation_runs(created_at desc);

create or replace function public.crm_phase5_set_updated_at() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin new.updated_at=now(); return new; end $$;
create trigger crm_automation_settings_updated before update on public.crm_automation_settings for each row execute function public.crm_phase5_set_updated_at();
create trigger crm_step_executions_updated before update on public.crm_sequence_step_executions for each row execute function public.crm_phase5_set_updated_at();

-- One transaction claims enrollments and materializes their idempotency record. Expired leases are recoverable.
create or replace function public.crm_claim_due_sequence_enrollments(p_worker_id text,p_limit integer,p_lease_seconds integer)
returns table(enrollment_id uuid,sequence_id uuid,step_id uuid,step_order integer,step_type text,step_config jsonb,execution_id uuid,execution_key text,attempt_count integer,lease_recovered boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if nullif(trim(p_worker_id),'') is null then raise exception 'worker id required'; end if;
 return query
 with due as (
   select e.id,e.sequence_id,e.current_step_order,s.id step_id,s.step_type,s.configuration
   from crm_sequence_enrollments e join crm_sequences q on q.id=e.sequence_id and q.status='active'
   join crm_sequence_steps s on s.sequence_id=e.sequence_id and s.step_order=e.current_step_order
   left join crm_sequence_step_executions x on x.enrollment_id=e.id and x.step_order=e.current_step_order and x.generation=1
   where e.status='active' and e.next_step_at<=now()
     and (x.id is null or (x.status in ('pending','retry_scheduled','claimed','processing') and coalesce(x.next_retry_at,'-infinity')<=now() and (x.lease_expires_at is null or x.lease_expires_at<now())))
   order by e.next_step_at,e.id for update of e skip locked limit greatest(1,least(p_limit,250))
 ), upserted as (
   insert into crm_sequence_step_executions(execution_key,enrollment_id,sequence_id,step_id,step_order,status,claimed_by,claimed_at,lease_expires_at,attempt_count,metadata)
   select d.id||':'||d.current_step_order||':1',d.id,d.sequence_id,d.step_id,d.current_step_order,'claimed',p_worker_id,now(),now()+make_interval(secs=>greatest(30,least(p_lease_seconds,3600))),1,
     jsonb_build_object('lease_recovered',false) from due d
   on conflict(enrollment_id,step_order,generation) do update set status='claimed',claimed_by=p_worker_id,claimed_at=now(),lease_expires_at=now()+make_interval(secs=>greatest(30,least(p_lease_seconds,3600))),attempt_count=crm_sequence_step_executions.attempt_count+1,
     metadata=crm_sequence_step_executions.metadata||jsonb_build_object('lease_recovered',crm_sequence_step_executions.lease_expires_at<now(),'recovered_at',case when crm_sequence_step_executions.lease_expires_at<now() then now() end)
   returning *
 )
 select u.enrollment_id,u.sequence_id,u.step_id,u.step_order,d.step_type,coalesce(d.configuration,'{}'),u.id,u.execution_key,u.attempt_count,coalesce((u.metadata->>'lease_recovered')::boolean,false)
 from upserted u join due d on d.id=u.enrollment_id;
end $$;
create or replace function public.crm_release_sequence_lease(p_execution_id uuid,p_worker_id text,p_next_retry_at timestamptz default null)
returns boolean language sql security definer set search_path=public,pg_temp as $$
 update crm_sequence_step_executions set status=case when p_next_retry_at is null then 'pending' else 'retry_scheduled' end,
 next_retry_at=p_next_retry_at,claimed_by=null,claimed_at=null,lease_expires_at=null
 where id=p_execution_id and claimed_by=p_worker_id returning true $$;
revoke all on function public.crm_claim_due_sequence_enrollments(text,integer,integer) from public,anon,authenticated;
revoke all on function public.crm_release_sequence_lease(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_claim_due_sequence_enrollments(text,integer,integer) to service_role;
grant execute on function public.crm_release_sequence_lease(uuid,text,timestamptz) to service_role;

alter table public.crm_automation_settings enable row level security;
alter table public.crm_automation_runs enable row level security;
alter table public.crm_sequence_step_executions enable row level security;
create policy crm_automation_staff_read_settings on public.crm_automation_settings for select to authenticated using(public.crm_is_admin());
create policy crm_automation_admin_settings on public.crm_automation_settings for all to authenticated using(public.crm_is_admin()) with check(public.crm_is_admin());
create policy crm_automation_staff_read_runs on public.crm_automation_runs for select to authenticated using(public.crm_is_admin());
create policy crm_automation_staff_read_executions on public.crm_sequence_step_executions for select to authenticated using(public.crm_is_admin());
comment on table public.crm_sequence_step_executions is 'Idempotent Phase 5 sequence step ledger; execution_key is enrollment:step:generation.';
