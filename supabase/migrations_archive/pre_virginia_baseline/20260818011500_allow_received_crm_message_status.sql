-- Inbound provider webhooks persist messages as `received`.
-- Keep the canonical message status constraint aligned with that state.

alter table public.crm_messages
  drop constraint if exists crm_messages_status_check;

alter table public.crm_messages
  add constraint crm_messages_status_check
  check (
    status = any (
      array[
        'draft'::text,
        'pending_approval'::text,
        'approved'::text,
        'scheduled'::text,
        'queued'::text,
        'sent'::text,
        'delivered'::text,
        'received'::text,
        'opened'::text,
        'clicked'::text,
        'replied'::text,
        'failed'::text,
        'bounced'::text,
        'suppressed'::text,
        'cancelled'::text
      ]
    )
  );
