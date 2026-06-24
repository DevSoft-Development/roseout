create table if not exists public.launch_waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  email text not null,
  phone text null,
  social_handle text null,
  social_platform text null,
  usually_go_out_area text null,
  wants_giveaway boolean not null default true,
  followed_social boolean not null default false,
  tagged_two_friends boolean not null default false,
  giveaway_status text not null default 'email_unverified',
  giveaway_verified_at timestamptz null,
  giveaway_verified_by uuid null,
  giveaway_notes text null,
  giveaway_post_url text null,
  email_verified boolean not null default false,
  email_verified_at timestamptz null,
  email_verification_token_hash text null,
  email_verification_sent_at timestamptz null,
  email_verification_expires_at timestamptz null,
  email_verification_attempts integer not null default 0,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz null,
  marketing_consent_text text null,
  sms_consent boolean not null default false,
  sms_consent_at timestamptz null,
  sms_consent_text text null,
  email_consent boolean not null default false,
  email_consent_at timestamptz null,
  email_consent_text text null,
  consent_ip_address text null,
  consent_user_agent text null,
  source text not null default 'homepage',
  referrer text null,
  user_agent text null,
  ip_address text null,
  turnstile_verified boolean not null default false,
  turnstile_action text null,
  turnstile_hostname text null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  duplicate_flag boolean not null default false,
  duplicate_reason text null,
  duplicate_checked_at timestamptz null
);

alter table public.launch_waitlist_signups add column if not exists full_name text;
alter table public.launch_waitlist_signups add column if not exists email text;
alter table public.launch_waitlist_signups add column if not exists phone text;
alter table public.launch_waitlist_signups add column if not exists social_handle text;
alter table public.launch_waitlist_signups add column if not exists social_platform text;
alter table public.launch_waitlist_signups add column if not exists usually_go_out_area text;
alter table public.launch_waitlist_signups add column if not exists wants_giveaway boolean not null default true;
alter table public.launch_waitlist_signups add column if not exists followed_social boolean not null default false;
alter table public.launch_waitlist_signups add column if not exists tagged_two_friends boolean not null default false;
alter table public.launch_waitlist_signups add column if not exists giveaway_status text not null default 'email_unverified';
alter table public.launch_waitlist_signups add column if not exists giveaway_verified_at timestamptz;
alter table public.launch_waitlist_signups add column if not exists giveaway_verified_by uuid;
alter table public.launch_waitlist_signups add column if not exists giveaway_notes text;
alter table public.launch_waitlist_signups add column if not exists giveaway_post_url text;
alter table public.launch_waitlist_signups add column if not exists email_verified boolean not null default false;
alter table public.launch_waitlist_signups add column if not exists email_verified_at timestamptz;
alter table public.launch_waitlist_signups add column if not exists email_verification_token_hash text;
alter table public.launch_waitlist_signups add column if not exists email_verification_sent_at timestamptz;
alter table public.launch_waitlist_signups add column if not exists email_verification_expires_at timestamptz;
alter table public.launch_waitlist_signups add column if not exists email_verification_attempts integer not null default 0;
alter table public.launch_waitlist_signups add column if not exists marketing_consent boolean not null default false;
alter table public.launch_waitlist_signups add column if not exists marketing_consent_at timestamptz;
alter table public.launch_waitlist_signups add column if not exists marketing_consent_text text;
alter table public.launch_waitlist_signups add column if not exists sms_consent boolean not null default false;
alter table public.launch_waitlist_signups add column if not exists sms_consent_at timestamptz;
alter table public.launch_waitlist_signups add column if not exists sms_consent_text text;
alter table public.launch_waitlist_signups add column if not exists email_consent boolean not null default false;
alter table public.launch_waitlist_signups add column if not exists email_consent_at timestamptz;
alter table public.launch_waitlist_signups add column if not exists email_consent_text text;
alter table public.launch_waitlist_signups add column if not exists consent_ip_address text;
alter table public.launch_waitlist_signups add column if not exists consent_user_agent text;
alter table public.launch_waitlist_signups add column if not exists source text not null default 'homepage';
alter table public.launch_waitlist_signups add column if not exists referrer text;
alter table public.launch_waitlist_signups add column if not exists user_agent text;
alter table public.launch_waitlist_signups add column if not exists ip_address text;
alter table public.launch_waitlist_signups add column if not exists turnstile_verified boolean not null default false;
alter table public.launch_waitlist_signups add column if not exists turnstile_action text;
alter table public.launch_waitlist_signups add column if not exists turnstile_hostname text;
alter table public.launch_waitlist_signups add column if not exists metadata jsonb not null default '{}';
alter table public.launch_waitlist_signups add column if not exists created_at timestamptz not null default now();
alter table public.launch_waitlist_signups add column if not exists updated_at timestamptz not null default now();
alter table public.launch_waitlist_signups add column if not exists duplicate_flag boolean not null default false;
alter table public.launch_waitlist_signups add column if not exists duplicate_reason text;
alter table public.launch_waitlist_signups add column if not exists duplicate_checked_at timestamptz;

update public.launch_waitlist_signups
set full_name = 'Launch List Member'
where full_name is null or btrim(full_name) = '';

alter table public.launch_waitlist_signups alter column full_name set not null;
alter table public.launch_waitlist_signups alter column email set not null;

alter table public.launch_waitlist_signups drop constraint if exists launch_waitlist_social_platform_allowed;
alter table public.launch_waitlist_signups add constraint launch_waitlist_social_platform_allowed
check (social_platform in ('instagram', 'tiktok', 'both') or social_platform is null);

alter table public.launch_waitlist_signups drop constraint if exists launch_waitlist_giveaway_status_allowed;
alter table public.launch_waitlist_signups add constraint launch_waitlist_giveaway_status_allowed
check (giveaway_status in ('not_entered', 'email_unverified', 'pending_verification', 'verified', 'disqualified', 'winner', 'alternate'));

alter table public.launch_waitlist_signups drop constraint if exists launch_waitlist_giveaway_social_required;

create unique index if not exists launch_waitlist_unique_email_lower on public.launch_waitlist_signups (lower(email));
create unique index if not exists launch_waitlist_unique_giveaway_social_platform_handle
on public.launch_waitlist_signups (social_platform, lower(social_handle))
where wants_giveaway = true and social_handle is not null and btrim(social_handle) <> '';
create index if not exists launch_waitlist_full_name_lower_idx on public.launch_waitlist_signups (lower(full_name));
create index if not exists launch_waitlist_social_handle_lower_idx on public.launch_waitlist_signups (lower(social_handle));
create index if not exists launch_waitlist_giveaway_status_idx on public.launch_waitlist_signups (giveaway_status);
create index if not exists launch_waitlist_wants_giveaway_idx on public.launch_waitlist_signups (wants_giveaway);
create index if not exists launch_waitlist_email_verified_idx on public.launch_waitlist_signups (email_verified);
create index if not exists launch_waitlist_token_hash_idx on public.launch_waitlist_signups (email_verification_token_hash);
create index if not exists launch_waitlist_created_at_desc_idx on public.launch_waitlist_signups (created_at desc);
create index if not exists launch_waitlist_social_platform_idx on public.launch_waitlist_signups (social_platform);
create index if not exists launch_waitlist_followed_social_idx on public.launch_waitlist_signups (followed_social);
create index if not exists launch_waitlist_tagged_two_friends_idx on public.launch_waitlist_signups (tagged_two_friends);
create index if not exists launch_waitlist_marketing_consent_idx on public.launch_waitlist_signups (marketing_consent);
create index if not exists launch_waitlist_duplicate_flag_idx on public.launch_waitlist_signups (duplicate_flag);

create table if not exists public.launch_waitlist_duplicate_events (
  id uuid primary key default gen_random_uuid(),
  signup_id uuid null references public.launch_waitlist_signups(id) on delete set null,
  attempted_email text null,
  attempted_social_handle text null,
  attempted_social_platform text null,
  conflict_type text not null,
  conflict_signup_id uuid null references public.launch_waitlist_signups(id) on delete set null,
  source text not null default 'homepage',
  ip_address text null,
  user_agent text null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.launch_waitlist_duplicate_events drop constraint if exists launch_waitlist_duplicate_conflict_allowed;
alter table public.launch_waitlist_duplicate_events add constraint launch_waitlist_duplicate_conflict_allowed
check (conflict_type in ('duplicate_email', 'duplicate_social_handle', 'duplicate_email_and_social_handle', 'social_handle_platform_conflict'));

create index if not exists launch_waitlist_duplicate_events_created_idx on public.launch_waitlist_duplicate_events (created_at desc);
create index if not exists launch_waitlist_duplicate_events_email_idx on public.launch_waitlist_duplicate_events (lower(attempted_email));
create index if not exists launch_waitlist_duplicate_events_handle_idx on public.launch_waitlist_duplicate_events (lower(attempted_social_handle));

create or replace function public.set_launch_waitlist_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_launch_waitlist_updated_at on public.launch_waitlist_signups;
create trigger set_launch_waitlist_updated_at
before update on public.launch_waitlist_signups
for each row execute function public.set_launch_waitlist_updated_at();

alter table public.launch_waitlist_signups enable row level security;
alter table public.launch_waitlist_duplicate_events enable row level security;

drop policy if exists "No public launch waitlist select" on public.launch_waitlist_signups;
drop policy if exists "No public launch waitlist insert" on public.launch_waitlist_signups;
drop policy if exists "No public launch waitlist update" on public.launch_waitlist_signups;
drop policy if exists "No public launch waitlist delete" on public.launch_waitlist_signups;
