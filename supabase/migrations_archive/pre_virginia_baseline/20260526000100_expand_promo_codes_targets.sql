alter table public.promo_codes
  add column if not exists target_scope text not null default 'any'
    check (target_scope in ('any', 'specific_user', 'specific_location', 'signup_user', 'signup_location_owner')),
  add column if not exists assigned_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists assigned_location_id uuid null,
  add column if not exists assigned_location_name text null,
  add column if not exists signup_context text null
    check (signup_context is null or signup_context in ('user_signup', 'location_owner_signup', 'both_signups')),
  add column if not exists auto_generated boolean not null default false,
  add column if not exists internal_notes text null;

create index if not exists promo_codes_target_scope_idx on public.promo_codes(target_scope);
create index if not exists promo_codes_assigned_user_id_idx on public.promo_codes(assigned_user_id);
create index if not exists promo_codes_assigned_location_id_idx on public.promo_codes(assigned_location_id);
create index if not exists promo_codes_signup_context_idx on public.promo_codes(signup_context);

alter table public.promo_code_redemptions
  add column if not exists signup_context text null,
  add column if not exists assigned_user_id uuid null,
  add column if not exists assigned_location_id uuid null;

alter table public.locations
  add column if not exists plan text,
  add column if not exists plan_status text,
  add column if not exists pro_until timestamptz,
  add column if not exists promo_code_used text;
