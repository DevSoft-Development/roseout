-- Allow intentionally unmatched inbound CRM SMS threads to exist before a contact/account/location is known.
-- Keep every other conversation subject to the canonical linked-record requirement.

alter table public.crm_conversations
  drop constraint if exists crm_conversations_check;

alter table public.crm_conversations
  add constraint crm_conversations_check
  check (
    account_id is not null
    or location_id is not null
    or contact_id is not null
    or opportunity_id is not null
    or task_id is not null
    or support_ticket_id is not null
    or (
      channel = 'sms'
      and assigned_team = 'crm'
      and conversation_key like 'sms:unmatched:%'
      and coalesce(metadata->>'routing_status', '') = 'unmatched'
    )
  );
