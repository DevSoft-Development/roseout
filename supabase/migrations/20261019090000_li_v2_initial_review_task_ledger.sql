-- One-time review acquisition intent belongs to staging, not locations.
-- Immutable business key prevents re-purchase across campaigns and retry attempts.
create table if not exists private.li_v2_initial_review_tasks (
 id uuid primary key default gen_random_uuid(),
 business_key text not null unique,
 campaign_id text not null,
 run_id text,
 google_place_id text not null,
 stage_id uuid not null references public.location_import_staging(id),
 spend_event_key text not null unique,
 estimated_usd numeric(16,6) not null check (estimated_usd > 0),
 status text not null default 'reserved' check
   (status in ('reserved','submitting','submission_unknown','submitted','collected','not_available','quarantined')),
 provider_task_id text unique,
 submission_started_at timestamptz,
 submitted_at timestamptz,
 collected_at timestamptz,
 result_count integer check (result_count between 0 and 100),
 error_reason text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists li_v2_initial_review_task_status_idx on private.li_v2_initial_review_tasks(status,updated_at);
revoke all on private.li_v2_initial_review_tasks from public,anon,authenticated;

-- Atomic reservation and unique task intent. Existing tasks are never submitted again by claiming.
create or replace function public.li_v2_claim_initial_review_task(
 p_stage_id uuid,p_business_key text,p_campaign_id text,p_run_id text,
 p_google_place_id text,p_estimated_usd numeric
) returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.li_v2_initial_review_tasks%rowtype;
declare key text;
declare permitted boolean;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_stage_id is null or p_business_key is null or length(p_business_key)<8
    or p_campaign_id is null or p_google_place_id is null or length(p_google_place_id)<8
    or p_estimated_usd is null or p_estimated_usd<=0 then
   raise exception 'invalid_initial_review_request';
 end if;
 if not exists(select 1 from public.location_import_staging s
   where s.id=p_stage_id and s.source='li_v2_independent'
     and s.import_status <> 'published') then
   raise exception 'initial_review_stage_not_eligible';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 select * into t from private.li_v2_initial_review_tasks where business_key=p_business_key;
 if found then
   return pg_catalog.jsonb_build_object('id',t.id,'status',t.status,'created',false);
 end if;
 key:='li_v2_initial_100:'||p_business_key;
 permitted:=public.reserve_location_acquisition_spend(
   key,'dataforseo','initial_100_reviews',p_estimated_usd,p_campaign_id,p_run_id);
 if not permitted then return pg_catalog.jsonb_build_object('status','budget_denied','created',false); end if;
 insert into private.li_v2_initial_review_tasks
 (business_key,campaign_id,run_id,google_place_id,stage_id,spend_event_key,estimated_usd)
 values(p_business_key,p_campaign_id,p_run_id,p_google_place_id,p_stage_id,key,p_estimated_usd)
 returning * into t;
 return pg_catalog.jsonb_build_object('id',t.id,'status',t.status,'created',true);
end $$;
revoke all on function public.li_v2_claim_initial_review_task(uuid,text,text,text,text,numeric) from public,anon,authenticated;
grant execute on function public.li_v2_claim_initial_review_task(uuid,text,text,text,text,numeric) to service_role;

-- The only transition that grants one attempt at provider task_post.
-- Set submitting BEFORE HTTP; uncertain outcomes never re-post automatically.
create or replace function public.li_v2_begin_initial_review_submission(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 update private.li_v2_initial_review_tasks
 set status='submitting',submission_started_at=now(),updated_at=now()
 where id=p_id and status='reserved';
 get diagnostics changed=row_count;
 return changed=1;
end $$;
revoke all on function public.li_v2_begin_initial_review_submission(uuid) from public,anon,authenticated;
grant execute on function public.li_v2_begin_initial_review_submission(uuid) to service_role;

-- Service-only durable status transitions, with no automatic retry from unknown.
create or replace function public.li_v2_update_initial_review_task(
 p_id uuid,p_expected_status text,p_status text,p_task_id text default null,
 p_result_count integer default null,p_error text default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if not ((p_expected_status='submitting' and p_status in ('submitted','submission_unknown'))
 or (p_expected_status='submitted' and p_status in ('collected','not_available','quarantined')))
 then raise exception 'invalid_review_task_transition'; end if;
 if p_status='submitted' and (p_task_id is null or length(p_task_id)<20) then
 raise exception 'review_provider_task_id_required'; end if;
 if p_status='collected' and (p_result_count is null or p_result_count<0 or p_result_count>100) then
 raise exception 'review_result_count_invalid'; end if;
 update private.li_v2_initial_review_tasks
 set status=p_status,provider_task_id=coalesce(p_task_id,provider_task_id),
 result_count=coalesce(p_result_count,result_count),
 error_reason=p_error,
 submitted_at=case when p_status='submitted' then now() else submitted_at end,
 collected_at=case when p_status in ('collected','not_available') then now() else collected_at end,
 updated_at=now()
 where id=p_id and status=p_expected_status;
 get diagnostics changed=row_count;
 return changed=1;
end $$;
revoke all on function public.li_v2_update_initial_review_task(uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.li_v2_update_initial_review_task(uuid,text,text,text,integer,text) to service_role;

create or replace function public.li_v2_initial_review_task_snapshot(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select pg_catalog.to_jsonb(t) from private.li_v2_initial_review_tasks t where t.id=p_id
$$;
revoke all on function public.li_v2_initial_review_task_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.li_v2_initial_review_task_snapshot(uuid) to service_role;
