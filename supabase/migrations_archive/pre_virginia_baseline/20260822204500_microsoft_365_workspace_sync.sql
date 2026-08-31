create table if not exists public.microsoft_365_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  tenant_id text not null,
  microsoft_user_id text not null,
  email text not null,
  display_name text,
  granted_scopes text[] not null default '{}',
  access_token_encrypted text,
  refresh_token_encrypted text,
  access_token_expires_at timestamptz,
  status text not null default 'active' check (status in ('active','reauthorization_required','revoked','error')),
  last_error text,
  connected_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists microsoft_365_connections_tenant_user_uidx on public.microsoft_365_connections(tenant_id,microsoft_user_id);

create table if not exists public.microsoft_365_sync_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_sync_enabled boolean not null default true,
  email_sync_mode text not null default 'crm_related_only' check (email_sync_mode in ('crm_related_only','all')),
  include_internal_mail boolean not null default false,
  sync_attachments boolean not null default false,
  queue_unmatched_email boolean not null default true,
  calendar_sync_enabled boolean not null default true,
  calendar_sync_direction text not null default 'two_way' check (calendar_sync_direction in ('microsoft_to_theouthaven','theouthaven_to_microsoft','two_way')),
  task_sync_enabled boolean not null default true,
  task_sync_direction text not null default 'two_way' check (task_sync_direction in ('microsoft_to_theouthaven','theouthaven_to_microsoft','two_way')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.microsoft_365_sync_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource text not null check (resource in ('mail_inbox','mail_sent','calendar','todo_lists','todo_tasks')),
  resource_key text not null default 'default',
  delta_link text,
  last_synced_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  unique(user_id,resource,resource_key)
);

create table if not exists public.microsoft_365_unmatched_email (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_message_id text not null,
  provider_thread_id text,
  internet_message_id text,
  sender_email text,
  recipient_emails text[] not null default '{}',
  subject text,
  preview_text text,
  received_at timestamptz,
  status text not null default 'pending' check (status in ('pending','matched','ignored')),
  matched_contact_id uuid references public.crm_contacts(id) on delete set null,
  matched_account_id uuid references public.crm_accounts(id) on delete set null,
  matched_location_id uuid references public.locations(id) on delete set null,
  matched_conversation_id uuid references public.crm_conversations(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,provider_message_id)
);
create index if not exists microsoft_365_unmatched_email_queue_idx on public.microsoft_365_unmatched_email(user_id,status,received_at desc);

create table if not exists public.microsoft_365_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_event_id text not null,
  provider_calendar_id text,
  provider_change_key text,
  subject text,
  body_preview text,
  starts_at timestamptz,
  ends_at timestamptz,
  start_time_zone text,
  end_time_zone text,
  location_name text,
  organizer_email text,
  attendee_emails text[] not null default '{}',
  is_cancelled boolean not null default false,
  is_all_day boolean not null default false,
  web_link text,
  matched_contact_id uuid references public.crm_contacts(id) on delete set null,
  matched_account_id uuid references public.crm_accounts(id) on delete set null,
  matched_location_id uuid references public.locations(id) on delete set null,
  matched_task_id uuid references public.crm_tasks(id) on delete set null,
  graph_last_modified_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,provider_event_id)
);
create index if not exists microsoft_365_calendar_events_range_idx on public.microsoft_365_calendar_events(user_id,starts_at,ends_at);

create table if not exists public.microsoft_365_todo_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_list_id text not null,
  provider_task_id text not null,
  title text not null,
  body_text text,
  status text,
  importance text,
  due_at timestamptz,
  reminder_at timestamptz,
  completed_at timestamptz,
  matched_crm_task_id uuid references public.crm_tasks(id) on delete set null,
  graph_last_modified_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,provider_list_id,provider_task_id)
);
create index if not exists microsoft_365_todo_tasks_due_idx on public.microsoft_365_todo_tasks(user_id,due_at,status);

create unique index if not exists crm_messages_microsoft_graph_provider_uidx
  on public.crm_messages(provider,provider_message_id)
  where provider='microsoft_graph' and provider_message_id is not null;

alter table public.microsoft_365_connections enable row level security;
alter table public.microsoft_365_sync_preferences enable row level security;
alter table public.microsoft_365_sync_state enable row level security;
alter table public.microsoft_365_unmatched_email enable row level security;
alter table public.microsoft_365_calendar_events enable row level security;
alter table public.microsoft_365_todo_tasks enable row level security;

revoke all on table public.microsoft_365_connections from anon, authenticated;
revoke all on table public.microsoft_365_sync_preferences from anon, authenticated;
revoke all on table public.microsoft_365_sync_state from anon, authenticated;
revoke all on table public.microsoft_365_unmatched_email from anon, authenticated;
revoke all on table public.microsoft_365_calendar_events from anon, authenticated;
revoke all on table public.microsoft_365_todo_tasks from anon, authenticated;

comment on table public.microsoft_365_connections is 'Server-only Microsoft Graph delegated connection metadata. OAuth tokens are stored only after application-layer encryption.';
comment on table public.microsoft_365_sync_preferences is 'Per-admin Microsoft 365 sync controls. Defaults intentionally keep email CRM-related only, internal mail off, and attachment copying off.';
comment on table public.microsoft_365_unmatched_email is 'Minimal metadata queue for uncertain external email; full message bodies are not persisted until explicitly matched to CRM.';