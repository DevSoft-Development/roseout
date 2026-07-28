-- Phase 1 canonical CRM foundation. Additive, rerunnable, and intentionally does not mutate legacy CRM data.
create extension if not exists pgcrypto;

create table if not exists public.crm_accounts (
 id uuid primary key default gen_random_uuid(), name text not null check (btrim(name) <> ''), legal_name text,
 account_type text not null check (account_type in ('independent_business','multi_location_operator','hospitality_group','venue_group','partner','agency','vendor','internal','other')),
 lifecycle_stage text not null check (lifecycle_stage in ('prospect','engaged','qualified','claiming','onboarding','customer','expansion','renewal','churn_risk','churned','inactive')),
 status text not null default 'active' check (status in ('active','inactive','blocked','archived')),
 owner_user_id uuid references auth.users(id), parent_account_id uuid references public.crm_accounts(id), primary_contact_id uuid, billing_contact_id uuid,
 website text, phone text, email text, industry text, employee_count integer check (employee_count is null or employee_count >= 0), annual_revenue numeric check (annual_revenue is null or annual_revenue >= 0), currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
 source text, source_detail text, external_reference text, health_status text, health_score integer check (health_score between 0 and 100), risk_reason text, next_action text, next_action_at timestamptz, last_activity_at timestamptz, first_contacted_at timestamptz, became_customer_at timestamptz, renewal_date date,
 metadata jsonb not null default '{}', created_by uuid references auth.users(id), updated_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
create unique index if not exists crm_accounts_external_reference_uidx on public.crm_accounts(source, external_reference) where external_reference is not null;
create index if not exists crm_accounts_list_idx on public.crm_accounts(lifecycle_stage, account_type, owner_user_id, created_at desc) where archived_at is null;

create table if not exists public.crm_contacts (
 id uuid primary key default gen_random_uuid(), first_name text, last_name text, full_name text, email text, phone text, job_title text, department text, contact_type text, preferred_channel text, timezone text, linkedin_url text, instagram_handle text,
 is_primary boolean not null default false, is_decision_maker boolean not null default false, is_billing_contact boolean not null default false, is_operations_contact boolean not null default false, is_marketing_contact boolean not null default false,
 email_consent_status text, sms_consent_status text, do_not_contact boolean not null default false, do_not_contact_reason text, last_contacted_at timestamptz, metadata jsonb not null default '{}', created_by uuid references auth.users(id), updated_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
 constraint crm_contacts_identity_check check (coalesce(nullif(btrim(full_name),''),nullif(btrim(first_name),''),nullif(btrim(last_name),''),nullif(btrim(email),''),nullif(btrim(phone),''),nullif(btrim(instagram_handle),'')) is not null),
 constraint crm_contacts_dnc_reason_check check (not do_not_contact or do_not_contact_reason is not null)
);
create unique index if not exists crm_contacts_email_uidx on public.crm_contacts(lower(email)) where email is not null and archived_at is null;

create table if not exists public.crm_account_contacts (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references public.crm_accounts(id), contact_id uuid not null references public.crm_contacts(id), relationship_type text not null default 'other', role_label text, is_primary boolean not null default false, is_active boolean not null default true, started_at date, ended_at date, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (ended_at is null or started_at is null or ended_at >= started_at)
);
create unique index if not exists crm_account_contacts_active_uidx on public.crm_account_contacts(account_id,contact_id,relationship_type,coalesce(role_label,'')) where is_active;
create unique index if not exists crm_account_contacts_primary_uidx on public.crm_account_contacts(account_id) where is_primary and is_active;

create table if not exists public.crm_account_locations (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references public.crm_accounts(id), location_id uuid not null references public.locations(id), relationship_type text not null check (relationship_type in ('owner','operator','manager','franchisee','franchisor','parent_group','marketing_partner','billing_account','other')), is_primary_location boolean not null default false, is_billing_location boolean not null default false, ownership_percentage numeric check (ownership_percentage between 0 and 100), effective_from date, effective_to date, status text not null default 'active' check (status in ('active','inactive','pending','ended')), source text, metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (effective_to is null or effective_from is null or effective_to >= effective_from)
);
create unique index if not exists crm_account_locations_active_uidx on public.crm_account_locations(account_id,location_id,relationship_type) where status='active';
create unique index if not exists crm_account_locations_primary_uidx on public.crm_account_locations(account_id) where is_primary_location and status='active';
create index if not exists crm_account_locations_location_idx on public.crm_account_locations(location_id) where status='active';

create table if not exists public.crm_opportunities (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references public.crm_accounts(id), primary_contact_id uuid references public.crm_contacts(id), primary_location_id uuid references public.locations(id), parent_opportunity_id uuid references public.crm_opportunities(id), name text not null, pipeline_key text not null check (pipeline_key in ('business_claim','reserve_pro','promoted_listing','partnership','renewal_expansion')), stage text not null, status text not null default 'open' check(status in ('open','won','lost')), owner_user_id uuid references auth.users(id), amount numeric check(amount is null or amount >= 0), currency text not null default 'USD' check(currency ~ '^[A-Z]{3}$'), probability integer check(probability between 0 and 100), expected_close_date date, actual_close_date date, product_key text, lead_source text, next_step text, next_step_at timestamptz, loss_reason text, competitor text, proposal_sent_at timestamptz, contract_sent_at timestamptz, contract_signed_at timestamptz, metadata jsonb not null default '{}', created_by uuid references auth.users(id), updated_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz, check(stage <> 'closed_lost' or nullif(btrim(loss_reason),'') is not null)
);
create index if not exists crm_opportunities_account_idx on public.crm_opportunities(account_id,status,stage) where archived_at is null;

create table if not exists public.crm_tasks (
 id uuid primary key default gen_random_uuid(), account_id uuid references public.crm_accounts(id), location_id uuid references public.locations(id), contact_id uuid references public.crm_contacts(id), opportunity_id uuid references public.crm_opportunities(id), parent_task_id uuid references public.crm_tasks(id), title text not null check(btrim(title)<>''), description text, task_type text not null check(task_type in ('follow_up','outreach','claim_review','onboarding','support','billing','reservation','site_visit','data_correction','profile_review','renewal','sales','internal','other')), status text not null default 'open' check(status in ('open','in_progress','blocked','completed','cancelled')), priority text not null default 'normal' check(priority in ('low','normal','high','urgent')), assigned_to_user_id uuid references auth.users(id), assigned_team text, created_by uuid references auth.users(id), due_at timestamptz, started_at timestamptz, completed_at timestamptz, completed_by uuid references auth.users(id), completion_notes text, reminder_at timestamptz, recurrence_rule text, source text, source_record_id text, metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
 check(account_id is not null or location_id is not null or contact_id is not null or opportunity_id is not null), check((status='completed' and completed_at is not null) or (status<>'completed' and completed_at is null))
);
create index if not exists crm_tasks_work_queue_idx on public.crm_tasks(assigned_to_user_id,status,due_at) where archived_at is null;
create index if not exists crm_tasks_overdue_idx on public.crm_tasks(due_at,status) where archived_at is null and status in ('open','in_progress','blocked');

create table if not exists public.crm_activities (
 id uuid primary key default gen_random_uuid(), account_id uuid references public.crm_accounts(id), location_id uuid references public.locations(id), contact_id uuid references public.crm_contacts(id), opportunity_id uuid references public.crm_opportunities(id), task_id uuid references public.crm_tasks(id), actor_user_id uuid references auth.users(id), activity_type text not null, direction text, channel text, subject text, summary text not null check(btrim(summary)<>''), body text, outcome text, occurred_at timestamptz not null default now(), source_system text not null, source_table text, source_record_id text, visibility text not null default 'internal' check(visibility in ('internal','restricted')), is_system_generated boolean not null default false, metadata jsonb not null default '{}', created_at timestamptz not null default now(), check(account_id is not null or location_id is not null or contact_id is not null or opportunity_id is not null or task_id is not null)
);
create unique index if not exists crm_activities_idempotency_uidx on public.crm_activities(source_system,source_table,source_record_id,activity_type) where source_record_id is not null and is_system_generated;
create index if not exists crm_activities_account_timeline_idx on public.crm_activities(account_id,occurred_at desc);

do $$ begin
 if not exists(select 1 from pg_constraint where conname='crm_accounts_primary_contact_fk') then alter table public.crm_accounts add constraint crm_accounts_primary_contact_fk foreign key(primary_contact_id) references public.crm_contacts(id); end if;
 if not exists(select 1 from pg_constraint where conname='crm_accounts_billing_contact_fk') then alter table public.crm_accounts add constraint crm_accounts_billing_contact_fk foreign key(billing_contact_id) references public.crm_contacts(id); end if;
end $$;

create table if not exists public.crm_migration_links (id uuid primary key default gen_random_uuid(), source_table text not null, source_record_id text not null, target_entity_type text not null, target_entity_id uuid not null, migration_version text not null, match_strategy text not null, match_confidence text not null check(match_confidence in ('high','medium','low','review')), metadata jsonb not null default '{}', created_at timestamptz not null default now(), unique(source_table,source_record_id,target_entity_type,migration_version));

create or replace function public.crm_validate_opportunity_stage() returns trigger language plpgsql set search_path=public as $$
declare allowed text[];
begin
 allowed := case new.pipeline_key when 'business_claim' then array['identified','outreach_pending','contacted','engaged','claim_sent','claim_started','claim_review','claimed','closed_lost'] when 'reserve_pro' then array['identified','qualified','demo_scheduled','demo_completed','proposal','negotiation','payment_pending','closed_won','closed_lost'] when 'promoted_listing' then array['identified','qualified','proposal','payment_pending','active','closed_lost'] when 'partnership' then array['identified','discovery','qualified','proposal','legal_review','closed_won','closed_lost'] when 'renewal_expansion' then array['upcoming','review','expansion_identified','proposal','negotiation','renewed','expanded','churned'] end;
 if not (new.stage=any(allowed)) then raise exception 'invalid CRM stage % for pipeline %',new.stage,new.pipeline_key using errcode='23514'; end if;
 if new.stage='closed_lost' and nullif(btrim(new.loss_reason),'') is null then raise exception 'loss reason required' using errcode='23514'; end if;
 if new.stage in ('closed_won','closed_lost','claimed','active','renewed','expanded','churned') then new.actual_close_date=coalesce(new.actual_close_date,current_date); end if;
 return new;
end $$;
drop trigger if exists crm_opportunities_validate_stage on public.crm_opportunities;
create trigger crm_opportunities_validate_stage before insert or update of pipeline_key,stage,loss_reason on public.crm_opportunities for each row execute function public.crm_validate_opportunity_stage();

-- RLS is deliberately deny-by-default to browser clients; trusted server helpers authorize using admin_users and location scope.
do $$ declare t text; begin foreach t in array array['crm_accounts','crm_contacts','crm_account_contacts','crm_account_locations','crm_activities','crm_tasks','crm_opportunities','crm_migration_links'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
create or replace function public.crm_is_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from public.admin_users where user_id=auth.uid() and role in ('superadmin','admin')) $$;
revoke all on function public.crm_is_admin() from public; grant execute on function public.crm_is_admin() to authenticated;
do $$ declare t text; begin foreach t in array array['crm_accounts','crm_contacts','crm_account_contacts','crm_account_locations','crm_activities','crm_tasks','crm_opportunities'] loop execute format('drop policy if exists crm_admin_all on public.%I',t); execute format('create policy crm_admin_all on public.%I for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin())',t); end loop; end $$;
comment on function public.crm_is_admin is 'Least-privilege RLS role lookup; fixed search_path and no user_metadata authorization.';
