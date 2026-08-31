-- Phase 2: canonical operational work queue. Additive and safe to rerun after Phase 1.
alter table public.crm_tasks
 add column if not exists queue_key text not null default 'general', add column if not exists category text,
 add column if not exists subtype text, add column if not exists workflow_key text, add column if not exists workflow_stage text,
 add column if not exists assigned_by uuid references auth.users(id), add column if not exists assignment_reason text,
 add column if not exists claimed_at timestamptz, add column if not exists claimed_by uuid references auth.users(id),
 add column if not exists blocked_reason text, add column if not exists escalation_level text not null default 'none',
 add column if not exists escalation_reason text, add column if not exists escalated_at timestamptz,
 add column if not exists escalated_by uuid references auth.users(id), add column if not exists resolution_code text,
 add column if not exists resolution_summary text, add column if not exists snoozed_until timestamptz,
 add column if not exists last_reminded_at timestamptz, add column if not exists next_follow_up_at timestamptz,
 add column if not exists service_level_due_at timestamptz, add column if not exists first_response_at timestamptz,
 add column if not exists last_status_changed_at timestamptz not null default now(),
 add column if not exists last_assigned_at timestamptz, add column if not exists version integer not null default 1;

do $$ begin
 if not exists(select 1 from pg_constraint where conname='crm_tasks_queue_key_check') then alter table public.crm_tasks add constraint crm_tasks_queue_key_check check(queue_key in ('general','sales','outreach','claims','onboarding','support','reservations','billing','content','data_quality','renewals','partnerships')); end if;
 if not exists(select 1 from pg_constraint where conname='crm_tasks_escalation_check') then alter table public.crm_tasks add constraint crm_tasks_escalation_check check(escalation_level in ('none','attention','manager','critical')); end if;
 if not exists(select 1 from pg_constraint where conname='crm_tasks_version_check') then alter table public.crm_tasks add constraint crm_tasks_version_check check(version > 0); end if;
end $$;

create table if not exists public.crm_task_history (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.crm_tasks(id) on delete cascade,
 actor_user_id uuid references auth.users(id), event_type text not null check(event_type in ('created','updated','assigned','reassigned','claimed','unassigned','status_changed','priority_changed','due_date_changed','snoozed','unsnoozed','blocked','unblocked','escalated','deescalated','completed','reopened','cancelled','comment_added','relationship_changed','bulk_updated','system_reminder')),
 previous_status text, new_status text, previous_assignee_user_id uuid references auth.users(id), new_assignee_user_id uuid references auth.users(id), previous_priority text, new_priority text,
 previous_due_at timestamptz, new_due_at timestamptz, reason text, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table if not exists public.crm_task_comments (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.crm_tasks(id) on delete cascade, author_user_id uuid not null references auth.users(id), body text not null check(length(btrim(body)) between 1 and 10000), is_internal boolean not null default true check(is_internal), mentioned_user_ids uuid[] not null default '{}', metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz, deleted_at timestamptz
);
create table if not exists public.crm_task_watchers (id uuid primary key default gen_random_uuid(),task_id uuid not null references public.crm_tasks(id) on delete cascade,user_id uuid not null references auth.users(id),watch_reason text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),unique(task_id,user_id));
create table if not exists public.crm_task_dependencies (id uuid primary key default gen_random_uuid(),task_id uuid not null references public.crm_tasks(id) on delete cascade,depends_on_task_id uuid not null references public.crm_tasks(id) on delete cascade,dependency_type text not null default 'blocks' check(dependency_type in ('blocks','requires','related')),created_by uuid references auth.users(id),created_at timestamptz not null default now(),unique(task_id,depends_on_task_id),check(task_id<>depends_on_task_id));
create table if not exists public.crm_task_saved_views (id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),team_key text,name text not null check(btrim(name)<>''),description text,is_shared boolean not null default false,is_default boolean not null default false,filters jsonb not null default '{}',sort jsonb not null default '{}',columns jsonb not null default '{}',created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),archived_at timestamptz,check(user_id is not null or team_key is not null or is_shared));
create unique index if not exists crm_task_saved_views_user_default_uidx on public.crm_task_saved_views(user_id) where is_default and archived_at is null;
create table if not exists public.crm_task_notifications (id uuid primary key default gen_random_uuid(),task_id uuid not null references public.crm_tasks(id) on delete cascade,recipient_user_id uuid not null references auth.users(id),notification_type text not null check(notification_type in ('assigned','mentioned','due_soon','overdue','escalated','reopened','blocked','dependency_completed','watcher_update','manager_attention')),title text not null,body text,read_at timestamptz,dismissed_at timestamptz,source_event_id uuid,created_at timestamptz not null default now());
create unique index if not exists crm_task_notifications_idempotency_uidx on public.crm_task_notifications(task_id,recipient_user_id,notification_type,source_event_id) where source_event_id is not null;
create table if not exists public.crm_task_templates (id uuid primary key default gen_random_uuid(),name text not null,queue_key text not null,task_type text not null,default_title text not null,default_description text,default_priority text,default_due_offset jsonb,required_relationships jsonb not null default '{}',completion_requirements jsonb not null default '{}',is_active boolean not null default true,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());

create index if not exists crm_tasks_operational_idx on public.crm_tasks(queue_key,status,escalation_level,due_at) where archived_at is null;
create index if not exists crm_tasks_team_idx on public.crm_tasks(assigned_team,status,due_at) where archived_at is null;
create index if not exists crm_tasks_source_idx on public.crm_tasks(source,source_record_id,task_type) where source_record_id is not null;
create unique index if not exists crm_tasks_source_idempotency_uidx on public.crm_tasks(source,source_record_id,task_type) where source_record_id is not null and archived_at is null;
create index if not exists crm_task_history_task_idx on public.crm_task_history(task_id,created_at desc);
create index if not exists crm_task_comments_task_idx on public.crm_task_comments(task_id,created_at desc) where deleted_at is null;
create index if not exists crm_task_notifications_recipient_idx on public.crm_task_notifications(recipient_user_id,created_at desc) where read_at is null and dismissed_at is null;

create or replace function public.crm_task_history_append_only() returns trigger language plpgsql set search_path=public as $$ begin raise exception 'crm_task_history is append-only' using errcode='55000'; end $$;
drop trigger if exists crm_task_history_no_mutation on public.crm_task_history;
create trigger crm_task_history_no_mutation before update or delete on public.crm_task_history for each row execute function public.crm_task_history_append_only();
create or replace function public.crm_prevent_task_dependency_cycle() returns trigger language plpgsql set search_path=public as $$ begin if exists(select 1 from public.crm_task_dependencies where task_id=new.depends_on_task_id and depends_on_task_id=new.task_id) then raise exception 'circular task dependency' using errcode='23514'; end if; return new; end $$;
drop trigger if exists crm_task_dependency_cycle on public.crm_task_dependencies;
create trigger crm_task_dependency_cycle before insert or update on public.crm_task_dependencies for each row execute function public.crm_prevent_task_dependency_cycle();

do $$ declare t text; begin foreach t in array array['crm_task_history','crm_task_comments','crm_task_watchers','crm_task_dependencies','crm_task_saved_views','crm_task_notifications','crm_task_templates'] loop execute format('alter table public.%I enable row level security',t); execute format('drop policy if exists crm_admin_all on public.%I',t); execute format('create policy crm_admin_all on public.%I for all to authenticated using (public.crm_is_admin()) with check (public.crm_is_admin())',t); end loop; end $$;

insert into public.crm_task_templates(name,queue_key,task_type,default_title,default_priority,completion_requirements)
select * from (values ('Claim review','claims','claim_review','Review claim','high','{"resolutionSummary":true}'::jsonb),('Support follow-up','support','support','Follow up on support issue','high','{"resolutionSummary":true}'::jsonb),('Publishability repair','data_quality','data_correction','Repair location publishability','normal','{"resolutionSummary":true}'::jsonb),('Renewal review','renewals','renewal','Review upcoming renewal','normal','{"resolutionSummary":true}'::jsonb),('Site visit','partnerships','site_visit','Complete site visit','normal','{}'::jsonb)) v(name,queue_key,task_type,default_title,default_priority,completion_requirements)
where not exists(select 1 from public.crm_task_templates t where t.name=v.name);
