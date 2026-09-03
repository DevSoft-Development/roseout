-- Phase 4: canonical CRM communications. Additive; provider/domain records remain intact.
create table public.crm_sender_identities (
 id uuid primary key default gen_random_uuid(), channel text not null check(channel in ('email','sms','notification')), display_name text,
 email_address text, phone_number text, provider text not null, provider_identity_id text, purpose text,
 allowed_teams text[], allowed_roles text[], is_default boolean not null default false, is_active boolean not null default true,
 reply_handling text, metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((channel='email' and email_address is not null) or (channel='sms' and phone_number is not null) or channel='notification')
);
create unique index crm_sender_identity_provider_key on public.crm_sender_identities(provider, provider_identity_id) where provider_identity_id is not null;

create table public.crm_templates (
 id uuid primary key default gen_random_uuid(), name text not null, template_key text unique, channel text not null check(channel in ('email','sms','internal','notification')),
 category text not null, status text not null default 'draft' check(status in ('draft','pending_approval','approved','rejected','archived')),
 owner_user_id uuid references auth.users, allowed_roles text[], allowed_teams text[], requires_approval boolean not null default false,
 is_system_template boolean not null default false, active_version_id uuid, created_by uuid references auth.users, updated_by uuid references auth.users,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
create table public.crm_template_versions (
 id uuid primary key default gen_random_uuid(), template_id uuid not null references public.crm_templates on delete cascade, version_number integer not null check(version_number>0),
 subject text, body_text text, body_html text, variables jsonb not null default '[]', change_summary text,
 approval_status text not null default 'draft' check(approval_status in ('draft','pending','approved','rejected','changes_requested')),
 approved_by uuid references auth.users, approved_at timestamptz, created_by uuid references auth.users, created_at timestamptz not null default now(), unique(template_id,version_number)
);
alter table public.crm_templates add constraint crm_templates_active_version_fk foreign key(active_version_id) references public.crm_template_versions;

create table public.crm_conversations (
 id uuid primary key default gen_random_uuid(), conversation_key text not null unique, channel text not null check(channel in ('email','sms','internal','notification','support','system')),
 status text not null default 'open' check(status in ('open','waiting_on_customer','waiting_on_team','resolved','closed','spam','suppressed','archived')), subject text,
 account_id uuid references public.crm_accounts, location_id uuid references public.locations, contact_id uuid references public.crm_contacts,
 opportunity_id uuid references public.crm_opportunities, task_id uuid references public.crm_tasks, support_ticket_id uuid,
 owner_user_id uuid references auth.users, assigned_team text, priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 last_message_at timestamptz, last_inbound_at timestamptz, last_outbound_at timestamptz, first_response_at timestamptz, closed_at timestamptz,
 closed_by uuid references auth.users, resolution_code text, resolution_summary text, is_unread boolean not null default false, unread_count integer not null default 0 check(unread_count>=0),
 metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
 check(account_id is not null or location_id is not null or contact_id is not null or opportunity_id is not null or task_id is not null or support_ticket_id is not null)
);
create table public.crm_messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.crm_conversations on delete cascade,
 direction text not null check(direction in ('inbound','outbound','internal','system')), channel text not null check(channel in ('email','sms','internal','notification','support','system')),
 message_type text not null, sender_user_id uuid references auth.users, sender_identity_id uuid references public.crm_sender_identities, contact_id uuid references public.crm_contacts,
 subject text, body_text text, body_html text, preview_text text, provider text, provider_message_id text, provider_thread_id text,
 status text not null default 'draft' check(status in ('draft','pending_approval','approved','scheduled','queued','sent','delivered','opened','clicked','replied','failed','bounced','suppressed','cancelled')),
 scheduled_for timestamptz, queued_at timestamptz, sent_at timestamptz, delivered_at timestamptz, opened_at timestamptz, clicked_at timestamptz, replied_at timestamptz,
 failed_at timestamptz, failure_code text, failure_reason text, template_id uuid references public.crm_templates, template_version_id uuid references public.crm_template_versions,
 sequence_id uuid, sequence_enrollment_id uuid, approval_id uuid, source_system text, source_record_id text, is_ai_assisted boolean not null default false,
 is_internal boolean not null default false, metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
 check(not is_internal or (direction='internal' and channel='internal'))
);
create unique index crm_message_provider_id on public.crm_messages(provider,provider_message_id) where provider_message_id is not null;
create unique index crm_message_source_id on public.crm_messages(source_system,source_record_id) where source_system is not null and source_record_id is not null;
create table public.crm_message_recipients (
 id uuid primary key default gen_random_uuid(), message_id uuid not null references public.crm_messages on delete cascade, contact_id uuid references public.crm_contacts,
 recipient_type text not null check(recipient_type in ('to','cc','bcc','sms','internal')), address text not null, delivery_status text,
 consent_snapshot jsonb not null default '{}', suppression_snapshot jsonb not null default '{}', provider_recipient_id text, created_at timestamptz not null default now()
);
create table public.crm_delivery_events (
 id uuid primary key default gen_random_uuid(), message_id uuid not null references public.crm_messages on delete cascade,
 recipient_id uuid references public.crm_message_recipients on delete set null, provider text not null, provider_event_id text,
 event_type text not null check(event_type in ('queued','sent','delivered','opened','clicked','replied','deferred','failed','soft_bounce','hard_bounce','complaint','unsubscribed','suppressed')),
 event_at timestamptz not null, provider_payload jsonb not null default '{}', created_at timestamptz not null default now()
);
create unique index crm_delivery_provider_event on public.crm_delivery_events(provider,provider_event_id) where provider_event_id is not null;

create table public.crm_contact_preferences (
 id uuid primary key default gen_random_uuid(), contact_id uuid not null references public.crm_contacts on delete cascade, channel text not null check(channel in ('email','sms','notification')),
 communication_type text not null check(communication_type in ('transactional','marketing','sales','support','reservation','claim','billing','onboarding','renewal')),
 status text not null check(status in ('granted','denied','unknown','not_required')), source text not null, captured_at timestamptz not null default now(), expires_at timestamptz,
 proof jsonb not null default '{}', updated_by uuid references auth.users, updated_at timestamptz not null default now(), unique(contact_id,channel,communication_type)
);
create table public.crm_suppression_entries (
 id uuid primary key default gen_random_uuid(), contact_id uuid references public.crm_contacts, channel text not null check(channel in ('email','sms','notification')),
 address text not null, suppression_type text not null check(suppression_type in ('unsubscribe','do_not_contact','hard_bounce','spam_complaint','invalid_address','manual','legal','provider_suppression')),
 reason text, source text not null, provider text, provider_reference text, is_active boolean not null default true, created_at timestamptz not null default now(),
 lifted_at timestamptz, lifted_by uuid references auth.users, metadata jsonb not null default '{}', check(is_active or (lifted_at is not null and lifted_by is not null))
);
create unique index crm_active_suppression on public.crm_suppression_entries(channel,lower(address),suppression_type) where is_active;

create table public.crm_communication_approvals (
 id uuid primary key default gen_random_uuid(), message_id uuid references public.crm_messages, template_version_id uuid references public.crm_template_versions,
 sequence_id uuid, requested_by uuid not null references auth.users, assigned_approver_id uuid references auth.users, approval_type text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','changes_requested','expired','cancelled')), request_reason text, approver_notes text,
 requested_at timestamptz not null default now(), reviewed_at timestamptz, expires_at timestamptz, metadata jsonb not null default '{}',
 check(message_id is not null or template_version_id is not null or sequence_id is not null)
);
alter table public.crm_messages add constraint crm_messages_approval_fk foreign key(approval_id) references public.crm_communication_approvals;

create table public.crm_sequences (
 id uuid primary key default gen_random_uuid(), sequence_key text unique, name text not null, description text, category text not null,
 status text not null default 'draft' check(status in ('draft','pending_approval','approved','active','paused','archived')),
 owner_user_id uuid references auth.users, allowed_roles text[], allowed_teams text[], requires_approval boolean not null default false, exit_rules jsonb not null default '{}',
 created_by uuid references auth.users, updated_by uuid references auth.users, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
create table public.crm_sequence_steps (
 id uuid primary key default gen_random_uuid(), sequence_id uuid not null references public.crm_sequences on delete cascade, step_order integer not null check(step_order>0),
 step_type text not null check(step_type in ('email','sms','task','wait','manual_review','internal_notification','exit_check')), delay_config jsonb not null default '{}',
 template_id uuid references public.crm_templates, task_template_id uuid, requires_manual_approval boolean not null default false, conditions jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(sequence_id,step_order)
);
create table public.crm_sequence_enrollments (
 id uuid primary key default gen_random_uuid(), sequence_id uuid not null references public.crm_sequences, contact_id uuid not null references public.crm_contacts,
 account_id uuid references public.crm_accounts, location_id uuid references public.locations, opportunity_id uuid references public.crm_opportunities, owner_user_id uuid references auth.users,
 status text not null default 'active' check(status in ('pending','active','paused','completed','exited','cancelled','failed','suppressed')), current_step_order integer not null default 1,
 next_step_at timestamptz, paused_at timestamptz, pause_reason text, completed_at timestamptz, exit_reason text, source_system text, source_record_id text,
 created_by uuid references auth.users, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index crm_enrollment_source on public.crm_sequence_enrollments(source_system,source_record_id) where source_system is not null and source_record_id is not null;
create unique index crm_active_enrollment on public.crm_sequence_enrollments(sequence_id,contact_id) where status in ('pending','active','paused');
create table public.crm_sequence_events (
 id uuid primary key default gen_random_uuid(), enrollment_id uuid not null references public.crm_sequence_enrollments on delete cascade,
 event_type text not null check(event_type in ('enrolled','step_scheduled','step_started','message_drafted','approval_requested','message_sent','message_failed','task_created','reply_received','paused','resumed','completed','exited','suppressed','cancelled')),
 step_order integer, message_id uuid references public.crm_messages, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table public.crm_messages add constraint crm_messages_sequence_fk foreign key(sequence_id) references public.crm_sequences;
alter table public.crm_messages add constraint crm_messages_enrollment_fk foreign key(sequence_enrollment_id) references public.crm_sequence_enrollments;
alter table public.crm_communication_approvals add constraint crm_approvals_sequence_fk foreign key(sequence_id) references public.crm_sequences;

-- Bounded workspace and runner indexes.
create index crm_conversations_inbox on public.crm_conversations(status,last_message_at desc) where archived_at is null;
create index crm_conversations_owner on public.crm_conversations(owner_user_id,last_message_at desc);
create index crm_conversations_team on public.crm_conversations(assigned_team,last_message_at desc);
create index crm_conversations_channel on public.crm_conversations(channel,last_message_at desc);
create index crm_conversations_unread on public.crm_conversations(last_message_at desc) where is_unread;
create index crm_conversations_entities on public.crm_conversations(account_id,location_id,contact_id);
create index crm_conversations_opportunity on public.crm_conversations(opportunity_id);
create index crm_conversations_task on public.crm_conversations(task_id);
create index crm_messages_conversation on public.crm_messages(conversation_id,created_at desc);
create index crm_messages_status_schedule on public.crm_messages(status,scheduled_for);
create index crm_messages_provider_thread on public.crm_messages(provider,provider_thread_id);
create index crm_delivery_event_type on public.crm_delivery_events(event_type,event_at desc);
create index crm_templates_filters on public.crm_templates(status,category,channel);
create index crm_sequences_status on public.crm_sequences(status,updated_at desc);
create index crm_enrollments_due on public.crm_sequence_enrollments(status,next_step_at) where status='active';
create index crm_preferences_contact on public.crm_contact_preferences(contact_id,channel);
create index crm_suppressions_contact on public.crm_suppression_entries(contact_id) where is_active;
create index crm_approvals_pending on public.crm_communication_approvals(assigned_approver_id,requested_at) where status='pending';

-- RLS: database role comes from canonical admin_users, never JWT user_metadata.
do $$ declare t text; begin foreach t in array array['crm_sender_identities','crm_templates','crm_template_versions','crm_conversations','crm_messages','crm_message_recipients','crm_delivery_events','crm_contact_preferences','crm_suppression_entries','crm_communication_approvals','crm_sequences','crm_sequence_steps','crm_sequence_enrollments','crm_sequence_events'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
create or replace function public.crm_communication_role() returns text language sql stable security definer set search_path=public,pg_temp as $$ select role::text from public.admin_users where user_id=auth.uid() limit 1 $$;
revoke all on function public.crm_communication_role() from public; grant execute on function public.crm_communication_role() to authenticated;
do $$ declare t text; begin foreach t in array array['crm_sender_identities','crm_templates','crm_template_versions','crm_conversations','crm_messages','crm_message_recipients','crm_delivery_events','crm_contact_preferences','crm_suppression_entries','crm_communication_approvals','crm_sequences','crm_sequence_steps','crm_sequence_enrollments','crm_sequence_events'] loop
 execute format('create policy %I on public.%I for select to authenticated using (public.crm_communication_role() in (''superadmin'',''admin'',''manager'',''editor'',''reviewer'',''viewer'',''ambassador'',''experience'',''partner_ambassador'',''experience_team''))','crm_comm_read_'||t,t);
 execute format('create policy %I on public.%I for all to authenticated using (public.crm_communication_role() in (''superadmin'',''admin'',''manager'',''editor'',''ambassador'',''experience'',''partner_ambassador'',''experience_team'')) with check (public.crm_communication_role() in (''superadmin'',''admin'',''manager'',''editor'',''ambassador'',''experience'',''partner_ambassador'',''experience_team''))','crm_comm_write_'||t,t);
end loop; end $$;
-- Append-only sequence events: revoke mutation even when table grants are widened later.
revoke update, delete on public.crm_sequence_events from authenticated;
-- Controlled initial catalog. Drafts are deliberately inactive until reviewed.
insert into public.crm_sequences(sequence_key,name,category,status,exit_rules) values
 ('business-claim-outreach','Business claim outreach','claim_outreach','draft','{"stop_on_reply":true,"stop_on_suppression":true,"stop_on_claim_completed":true}'),
 ('business-claim-follow-up','Business claim follow-up','claim_follow_up','draft','{"stop_on_reply":true,"stop_on_suppression":true,"stop_on_claim_completed":true}'),
 ('reserve-pro-introduction','Reserve Pro introduction','reserve_pro','draft','{"stop_on_reply":true,"stop_on_suppression":true}'),
 ('reserve-pro-demo-follow-up','Reserve Pro demo follow-up','demo','draft','{"stop_on_reply":true,"stop_on_suppression":true}'),
 ('proposal-follow-up','Proposal follow-up','proposal','draft','{"stop_on_reply":true,"stop_on_terminal_opportunity":true}'),
 ('owner-onboarding','Owner onboarding','onboarding','draft','{"stop_on_reply":false,"stop_on_suppression":true}'),
 ('renewal-outreach','Renewal outreach','renewal','draft','{"stop_on_reply":true,"stop_on_suppression":true}'),
 ('partnership-outreach','Partnership outreach','partnership','draft','{"stop_on_reply":true,"stop_on_suppression":true}'),
 ('payment-follow-up','Payment follow-up','payment','draft','{"stop_on_reply":true,"stop_on_suppression":true})
on conflict(sequence_key) do nothing;
insert into public.crm_sender_identities(channel,display_name,email_address,provider,purpose,allowed_roles,is_default,reply_handling) values
 ('email','TheOutHaven','hello@theouthaven.com','resend','account',array['superadmin','admin','manager'],true,'support@theouthaven.com'),
 ('email','TheOutHaven Business','business@theouthaven.com','resend','claims and owners',array['superadmin','admin','manager','ambassador','partner_ambassador'],false,'business@theouthaven.com'),
 ('email','TheOutHaven Support','support@theouthaven.com','resend','support',array['superadmin','admin','manager','experience','experience_team'],false,'support@theouthaven.com'),
 ('email','TheOutHaven Reservations','reserve@theouthaven.com','resend','reservations',array['superadmin','admin','manager','experience','experience_team'],false,'reserve@theouthaven.com'),
 ('email','TheOutHaven Admin','admin@theouthaven.com','resend','administration',array['superadmin','admin'],false,'admin@theouthaven.com')
on conflict do nothing;
