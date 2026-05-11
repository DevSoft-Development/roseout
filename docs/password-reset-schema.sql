-- TheOutHaven password reset hardening tables.
-- Run this in Supabase SQL before enabling the custom password reset flow.

create extension if not exists pgcrypto;

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  request_ip text,
  request_user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.password_reset_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  ip_address text not null,
  user_agent text,
  status text not null,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_hash_idx
  on public.password_reset_tokens (token_hash)
  where used_at is null;

create index if not exists password_reset_tokens_user_id_idx
  on public.password_reset_tokens (user_id, created_at desc);

create index if not exists password_reset_tokens_expires_at_idx
  on public.password_reset_tokens (expires_at);

create index if not exists password_reset_attempts_email_created_at_idx
  on public.password_reset_attempts (email, created_at desc);

create index if not exists password_reset_attempts_ip_created_at_idx
  on public.password_reset_attempts (ip_address, created_at desc);

alter table public.password_reset_tokens enable row level security;
alter table public.password_reset_attempts enable row level security;
