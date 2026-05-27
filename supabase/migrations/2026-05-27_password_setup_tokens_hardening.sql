create table if not exists public.password_setup_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  email text not null,
  token_hash text not null,
  purpose text not null default 'create_password',
  role text null default 'user',
  assigned_location_id uuid null,
  expires_at timestamptz not null,
  used_at timestamptz null,
  invalidated_reason text null,
  created_by uuid null,
  created_at timestamptz not null default now()
);

alter table public.password_setup_tokens
add column if not exists token_hash text,
add column if not exists purpose text default 'create_password',
add column if not exists role text default 'user',
add column if not exists assigned_location_id uuid,
add column if not exists expires_at timestamptz,
add column if not exists used_at timestamptz,
add column if not exists invalidated_reason text,
add column if not exists created_by uuid,
add column if not exists created_at timestamptz default now();

create index if not exists password_setup_tokens_token_hash_idx on public.password_setup_tokens(token_hash);
create index if not exists password_setup_tokens_email_purpose_idx on public.password_setup_tokens(email, purpose);
create index if not exists password_setup_tokens_user_id_purpose_idx on public.password_setup_tokens(user_id, purpose);
