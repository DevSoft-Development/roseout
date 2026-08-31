alter table public.microsoft_365_sync_preferences
  add column if not exists task_link_to_crm boolean not null default true;

alter table public.crm_tasks
  drop constraint if exists crm_tasks_check;

alter table public.crm_tasks
  add constraint crm_tasks_relationship_or_m365_owner_check
  check (
    account_id is not null
    or location_id is not null
    or contact_id is not null
    or opportunity_id is not null
    or (
      task_type = 'internal'
      and source = 'microsoft_365'
      and assigned_to_user_id is not null
    )
  );

create unique index if not exists crm_tasks_microsoft_365_source_uidx
  on public.crm_tasks(source, source_record_id)
  where source = 'microsoft_365'
    and source_record_id is not null
    and archived_at is null;

create unique index if not exists microsoft_365_todo_tasks_crm_link_uidx
  on public.microsoft_365_todo_tasks(user_id, matched_crm_task_id)
  where matched_crm_task_id is not null;

comment on column public.microsoft_365_sync_preferences.task_link_to_crm is
  'When enabled, Microsoft To Do items are represented by assigned internal CRM tasks by default and remain linked for two-way sync.';
