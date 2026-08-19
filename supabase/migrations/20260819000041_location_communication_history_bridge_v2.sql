alter table public.communication_logs drop constraint if exists communication_logs_channel_check;
alter table public.communication_logs add constraint communication_logs_channel_check
  check (channel = any (array['email'::text, 'sms'::text, 'call'::text, 'web'::text]));

create index if not exists communication_logs_canonical_message_idx
  on public.communication_logs ((metadata->>'canonical_crm_message_id'))
  where metadata ? 'canonical_crm_message_id';

create index if not exists communication_logs_crm_activity_idx
  on public.communication_logs ((metadata->>'crm_activity_id'))
  where metadata ? 'crm_activity_id';

create index if not exists communication_logs_support_message_idx
  on public.communication_logs ((metadata->>'support_ticket_message_id'))
  where metadata ? 'support_ticket_message_id';

create or replace function public.sync_crm_message_to_location_communication_log()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_conversation public.crm_conversations%rowtype;
  v_existing_id uuid;
  v_metadata jsonb;
begin
  select * into v_conversation
  from public.crm_conversations
  where id = new.conversation_id;

  if v_conversation.id is null or v_conversation.location_id is null then
    return new;
  end if;

  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'canonical', true,
    'canonical_crm_message_id', new.id::text,
    'conversation_id', new.conversation_id::text,
    'source_system', new.source_system,
    'message_type', new.message_type,
    'assigned_team', v_conversation.assigned_team,
    'reservation_id', v_conversation.reservation_id,
    'support_ticket_id', v_conversation.support_ticket_id,
    'conversation_key', v_conversation.conversation_key,
    'is_internal', new.is_internal,
    'is_ai_assisted', new.is_ai_assisted,
    'failure_code', new.failure_code,
    'failure_reason', new.failure_reason,
    'opened_at', new.opened_at,
    'clicked_at', new.clicked_at,
    'replied_at', new.replied_at,
    'delivered_at', new.delivered_at,
    'sent_at', new.sent_at
  )) || coalesce(new.metadata, '{}'::jsonb);

  select id into v_existing_id
  from public.communication_logs
  where metadata->>'canonical_crm_message_id' = new.id::text
  order by created_at desc nulls last
  limit 1;

  if v_existing_id is null then
    insert into public.communication_logs (
      channel,
      direction,
      from_address,
      to_address,
      recipient_type,
      recipient_id,
      subject,
      body,
      status,
      provider_message_id,
      metadata,
      created_by,
      created_at
    ) values (
      new.channel,
      new.direction,
      coalesce(new.metadata->>'from', new.metadata->>'from_address'),
      coalesce(new.metadata->>'to', new.metadata->>'to_address'),
      'location',
      v_conversation.location_id::text,
      coalesce(new.subject, v_conversation.subject),
      coalesce(new.body_text, new.preview_text, ''),
      new.status,
      new.provider_message_id,
      v_metadata,
      new.sender_user_id,
      coalesce(new.created_at, now())
    );
  else
    update public.communication_logs
    set
      channel = new.channel,
      direction = new.direction,
      from_address = coalesce(new.metadata->>'from', new.metadata->>'from_address', from_address),
      to_address = coalesce(new.metadata->>'to', new.metadata->>'to_address', to_address),
      subject = coalesce(new.subject, v_conversation.subject, subject),
      body = coalesce(new.body_text, new.preview_text, body),
      status = new.status,
      provider_message_id = coalesce(new.provider_message_id, provider_message_id),
      metadata = v_metadata,
      created_by = coalesce(new.sender_user_id, created_by)
    where id = v_existing_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_crm_message_to_location_communication_log on public.crm_messages;
create trigger trg_sync_crm_message_to_location_communication_log
after insert or update on public.crm_messages
for each row execute function public.sync_crm_message_to_location_communication_log();

create or replace function public.sync_crm_call_to_location_communication_log()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_metadata jsonb;
begin
  if new.location_id is null then
    return new;
  end if;

  if lower(new.activity_type) not in ('call', 'phone_call')
     and lower(coalesce(new.channel, '')) not in ('call', 'phone') then
    return new;
  end if;

  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'canonical', true,
    'crm_activity_id', new.id::text,
    'activity_type', new.activity_type,
    'source_system', new.source_system,
    'source_table', new.source_table,
    'source_record_id', new.source_record_id,
    'outcome', new.outcome,
    'visibility', new.visibility,
    'is_system_generated', new.is_system_generated
  )) || coalesce(new.metadata, '{}'::jsonb);

  select id into v_existing_id
  from public.communication_logs
  where metadata->>'crm_activity_id' = new.id::text
  order by created_at desc nulls last
  limit 1;

  if v_existing_id is null then
    insert into public.communication_logs (
      channel,
      direction,
      recipient_type,
      recipient_id,
      subject,
      body,
      status,
      metadata,
      created_by,
      created_at
    ) values (
      'call',
      coalesce(new.direction, 'outbound'),
      'location',
      new.location_id::text,
      coalesce(new.subject, new.summary),
      coalesce(new.body, new.summary),
      coalesce(new.outcome, 'completed'),
      v_metadata,
      new.actor_user_id,
      coalesce(new.occurred_at, new.created_at, now())
    );
  else
    update public.communication_logs
    set
      channel = 'call',
      direction = coalesce(new.direction, direction),
      subject = coalesce(new.subject, new.summary, subject),
      body = coalesce(new.body, new.summary, body),
      status = coalesce(new.outcome, status),
      metadata = v_metadata,
      created_by = coalesce(new.actor_user_id, created_by)
    where id = v_existing_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_crm_call_to_location_communication_log on public.crm_activities;
create trigger trg_sync_crm_call_to_location_communication_log
after insert or update on public.crm_activities
for each row execute function public.sync_crm_call_to_location_communication_log();

create or replace function public.sync_support_message_to_location_communication_log()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_ticket public.support_tickets%rowtype;
  v_location_id uuid;
  v_existing_id uuid;
  v_channel text;
  v_direction text;
  v_metadata jsonb;
begin
  if coalesce(new.internal_note, false) then
    return new;
  end if;

  select * into v_ticket
  from public.support_tickets
  where id = new.ticket_id;

  v_location_id := coalesce(v_ticket.location_id, v_ticket.related_location_id);
  if v_location_id is null then
    return new;
  end if;

  v_channel := lower(coalesce(nullif(new.channel, ''), 'web'));
  if v_channel not in ('email', 'sms', 'web') then
    v_channel := 'web';
  end if;

  v_direction := lower(coalesce(
    nullif(new.direction, ''),
    case when lower(coalesce(new.actor_type, '')) in ('admin', 'system') then 'outbound' else 'inbound' end
  ));
  if v_direction not in ('outbound', 'inbound') then
    v_direction := 'inbound';
  end if;

  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'canonical', true,
    'support_ticket_message_id', new.id::text,
    'support_ticket_id', new.ticket_id::text,
    'ticket_number', v_ticket.ticket_number,
    'department', v_ticket.department,
    'assigned_group', v_ticket.assigned_group,
    'actor_type', new.actor_type,
    'sender_role', new.sender_role,
    'provider', new.provider,
    'delivered_at', new.delivered_at,
    'failed_at', new.failed_at
  )) || coalesce(new.metadata, '{}'::jsonb);

  select id into v_existing_id
  from public.communication_logs
  where metadata->>'support_ticket_message_id' = new.id::text
  order by created_at desc nulls last
  limit 1;

  if v_existing_id is null then
    insert into public.communication_logs (
      channel,
      direction,
      from_address,
      to_address,
      recipient_type,
      recipient_id,
      subject,
      body,
      status,
      provider_message_id,
      metadata,
      created_by,
      created_at
    ) values (
      v_channel,
      v_direction,
      new.from_address,
      new.to_address,
      'location',
      v_location_id::text,
      coalesce(new.subject, v_ticket.subject),
      coalesce(new.message, new.body, ''),
      coalesce(new.delivery_status, 'sent'),
      new.provider_message_id,
      v_metadata,
      new.sender_user_id,
      new.created_at
    );
  else
    update public.communication_logs
    set
      channel = v_channel,
      direction = v_direction,
      from_address = coalesce(new.from_address, from_address),
      to_address = coalesce(new.to_address, to_address),
      subject = coalesce(new.subject, v_ticket.subject, subject),
      body = coalesce(new.message, new.body, body),
      status = coalesce(new.delivery_status, status),
      provider_message_id = coalesce(new.provider_message_id, provider_message_id),
      metadata = v_metadata,
      created_by = coalesce(new.sender_user_id, created_by)
    where id = v_existing_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_support_message_to_location_communication_log on public.support_ticket_messages;
create trigger trg_sync_support_message_to_location_communication_log
after insert or update on public.support_ticket_messages
for each row execute function public.sync_support_message_to_location_communication_log();

insert into public.communication_logs (
  channel, direction, from_address, to_address, recipient_type, recipient_id,
  subject, body, status, provider_message_id, metadata, created_by, created_at
)
select
  m.channel,
  m.direction,
  coalesce(m.metadata->>'from', m.metadata->>'from_address'),
  coalesce(m.metadata->>'to', m.metadata->>'to_address'),
  'location',
  c.location_id::text,
  coalesce(m.subject, c.subject),
  coalesce(m.body_text, m.preview_text, ''),
  m.status,
  m.provider_message_id,
  jsonb_strip_nulls(jsonb_build_object(
    'canonical', true,
    'canonical_crm_message_id', m.id::text,
    'conversation_id', m.conversation_id::text,
    'source_system', m.source_system,
    'message_type', m.message_type,
    'assigned_team', c.assigned_team,
    'reservation_id', c.reservation_id,
    'support_ticket_id', c.support_ticket_id,
    'conversation_key', c.conversation_key,
    'is_internal', m.is_internal,
    'is_ai_assisted', m.is_ai_assisted,
    'failure_code', m.failure_code,
    'failure_reason', m.failure_reason,
    'opened_at', m.opened_at,
    'clicked_at', m.clicked_at,
    'replied_at', m.replied_at,
    'delivered_at', m.delivered_at,
    'sent_at', m.sent_at
  )) || coalesce(m.metadata, '{}'::jsonb),
  m.sender_user_id,
  m.created_at
from public.crm_messages m
join public.crm_conversations c on c.id = m.conversation_id
where c.location_id is not null
  and m.archived_at is null
  and not exists (
    select 1 from public.communication_logs l
    where l.metadata->>'canonical_crm_message_id' = m.id::text
  );

insert into public.communication_logs (
  channel, direction, recipient_type, recipient_id, subject, body,
  status, metadata, created_by, created_at
)
select
  'call',
  coalesce(a.direction, 'outbound'),
  'location',
  a.location_id::text,
  coalesce(a.subject, a.summary),
  coalesce(a.body, a.summary),
  coalesce(a.outcome, 'completed'),
  jsonb_strip_nulls(jsonb_build_object(
    'canonical', true,
    'crm_activity_id', a.id::text,
    'activity_type', a.activity_type,
    'source_system', a.source_system,
    'source_table', a.source_table,
    'source_record_id', a.source_record_id,
    'outcome', a.outcome,
    'visibility', a.visibility,
    'is_system_generated', a.is_system_generated
  )) || coalesce(a.metadata, '{}'::jsonb),
  a.actor_user_id,
  coalesce(a.occurred_at, a.created_at)
from public.crm_activities a
where a.location_id is not null
  and (
    lower(a.activity_type) in ('call', 'phone_call')
    or lower(coalesce(a.channel, '')) in ('call', 'phone')
  )
  and not exists (
    select 1 from public.communication_logs l
    where l.metadata->>'crm_activity_id' = a.id::text
  );

insert into public.communication_logs (
  channel, direction, from_address, to_address, recipient_type, recipient_id,
  subject, body, status, provider_message_id, metadata, created_by, created_at
)
select
  case
    when lower(coalesce(nullif(m.channel, ''), 'web')) in ('email', 'sms', 'web')
      then lower(coalesce(nullif(m.channel, ''), 'web'))
    else 'web'
  end,
  case
    when lower(coalesce(
      nullif(m.direction, ''),
      case when lower(coalesce(m.actor_type, '')) in ('admin', 'system') then 'outbound' else 'inbound' end
    )) in ('outbound', 'inbound')
      then lower(coalesce(
        nullif(m.direction, ''),
        case when lower(coalesce(m.actor_type, '')) in ('admin', 'system') then 'outbound' else 'inbound' end
      ))
    else 'inbound'
  end,
  m.from_address,
  m.to_address,
  'location',
  coalesce(t.location_id, t.related_location_id)::text,
  coalesce(m.subject, t.subject),
  coalesce(m.message, m.body, ''),
  coalesce(m.delivery_status, 'sent'),
  m.provider_message_id,
  jsonb_strip_nulls(jsonb_build_object(
    'canonical', true,
    'support_ticket_message_id', m.id::text,
    'support_ticket_id', m.ticket_id::text,
    'ticket_number', t.ticket_number,
    'department', t.department,
    'assigned_group', t.assigned_group,
    'actor_type', m.actor_type,
    'sender_role', m.sender_role,
    'provider', m.provider,
    'delivered_at', m.delivered_at,
    'failed_at', m.failed_at
  )) || coalesce(m.metadata, '{}'::jsonb),
  m.sender_user_id,
  m.created_at
from public.support_ticket_messages m
join public.support_tickets t on t.id = m.ticket_id
where coalesce(t.location_id, t.related_location_id) is not null
  and not coalesce(m.internal_note, false)
  and not exists (
    select 1 from public.communication_logs l
    where l.metadata->>'support_ticket_message_id' = m.id::text
  );
