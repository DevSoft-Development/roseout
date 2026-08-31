alter table public.locations add column if not exists reservation_settings jsonb not null default '{}'::jsonb;
