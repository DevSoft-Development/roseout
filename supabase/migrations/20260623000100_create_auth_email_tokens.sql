create table if not exists public.auth_email_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  purpose text not null,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now(),
  created_by uuid null,
  ip_address inet null,
  user_agent text null,
  constraint auth_email_tokens_purpose_check check (purpose in ('signup_verify','password_reset','password_setup'))
);

alter table public.auth_email_tokens enable row level security;

drop policy if exists "No public auth email token access" on public.auth_email_tokens;
create policy "No public auth email token access" on public.auth_email_tokens for all using (false) with check (false);

create index if not exists auth_email_tokens_email_purpose_idx on public.auth_email_tokens (email, purpose);
create index if not exists auth_email_tokens_purpose_expires_at_idx on public.auth_email_tokens (purpose, expires_at);
create index if not exists auth_email_tokens_token_hash_idx on public.auth_email_tokens (token_hash);
