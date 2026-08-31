create table if not exists public.email_send_logs (
  id uuid primary key default gen_random_uuid(), template_key text not null, sender_key text, from_name text, from_email text, reply_to text, recipient_email text not null, recipient_type text, department text, subject text, status text not null default 'queued', provider_message_id text, sent_at timestamptz, failed_at timestamptz, failure_reason text, source_type text, source_id text, created_at timestamptz default now(), metadata jsonb default '{}'::jsonb
);
create index if not exists email_send_logs_created_at_idx on public.email_send_logs(created_at desc);
create index if not exists email_send_logs_template_key_idx on public.email_send_logs(template_key);
create table if not exists public.email_suppression_list (
  id uuid primary key default gen_random_uuid(), email text not null, scope text not null default 'global', location_id uuid null, reason text, source text, created_at timestamptz default now(), metadata jsonb default '{}'::jsonb
);
create unique index if not exists email_suppression_list_email_scope_idx on public.email_suppression_list(lower(email), scope, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid));
create table if not exists public.email_preferences (
  id uuid primary key default gen_random_uuid(), user_id uuid null, location_id uuid null, email_type text not null, enabled boolean not null default true, digest_only boolean not null default false, created_at timestamptz default now(), updated_at timestamptz default now(), metadata jsonb default '{}'::jsonb
);
create index if not exists email_preferences_user_type_idx on public.email_preferences(user_id, email_type);
