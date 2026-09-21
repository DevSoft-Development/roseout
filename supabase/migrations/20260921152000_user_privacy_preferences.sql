create table if not exists public.user_privacy_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  personalization_enabled boolean not null default true,
  search_history_personalization_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.user_privacy_preferences enable row level security;

drop policy if exists "users_read_own_privacy_preferences" on public.user_privacy_preferences;
create policy "users_read_own_privacy_preferences"
on public.user_privacy_preferences for select
using (auth.uid() = user_id);

drop policy if exists "users_insert_own_privacy_preferences" on public.user_privacy_preferences;
create policy "users_insert_own_privacy_preferences"
on public.user_privacy_preferences for insert
with check (auth.uid() = user_id);

drop policy if exists "users_update_own_privacy_preferences" on public.user_privacy_preferences;
create policy "users_update_own_privacy_preferences"
on public.user_privacy_preferences for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists idx_user_privacy_preferences_updated_at
  on public.user_privacy_preferences(updated_at desc);
