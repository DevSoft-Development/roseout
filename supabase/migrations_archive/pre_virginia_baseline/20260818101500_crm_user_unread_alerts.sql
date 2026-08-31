-- User-specific external delivery state for unread CRM message notifications.
alter table public.crm_message_notifications
  add column if not exists target_user_id uuid references auth.users(id) on delete set null,
  add column if not exists alert_claimed_at timestamptz,
  add column if not exists alerted_at timestamptz,
  add column if not exists email_alert_status text,
  add column if not exists sms_alert_status text;

create index if not exists crm_message_notifications_target_unread_idx
  on public.crm_message_notifications(target_user_id, created_at desc)
  where read_at is null and dismissed_at is null;

comment on column public.crm_message_notifications.target_user_id is
  'Signed-in CRM user who owns the conversation and receives external unread alerts.';
comment on column public.crm_message_notifications.alert_claimed_at is
  'Atomic delivery claim used to prevent duplicate email/SMS alerts on webhook retries.';
