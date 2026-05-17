-- Marketing Center foundation for TheOutHaven admin campaigns.
-- Creates campaign, message, audience, subscriber, send log, social post, and preference tables.

create extension if not exists pgcrypto;

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  campaign_type text not null default 'all_channels' check (campaign_type in ('social_post', 'email_blast', 'text_blast', 'all_channels')),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sent', 'failed')),
  selected_platforms text[] not null default '{}',
  audience_segment text,
  audience_id uuid,
  location_id uuid,
  location_source_type text check (location_source_type is null or location_source_type in ('locations', 'restaurants', 'activities')),
  location_source_id uuid,
  location_name text,
  location_image_url text,
  location_category text,
  location_city text,
  location_state text,
  location_address text,
  location_description text,
  public_location_url text,
  social_captions jsonb not null default '{}'::jsonb,
  hashtags text[] not null default '{}',
  email_subject text,
  email_body text,
  sms_text text,
  image_url text,
  video_url text,
  cta_url text,
  generated_prompt text,
  generated_payload jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_audiences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  segment_key text unique,
  filters jsonb not null default '{}'::jsonb,
  subscriber_count integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'marketing_campaigns_audience_id_fkey'
  ) then
    alter table public.marketing_campaigns
      add constraint marketing_campaigns_audience_id_fkey
      foreign key (audience_id) references public.marketing_audiences(id) on delete set null;
  end if;
end $$;

create table if not exists public.marketing_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'instagram', 'tiktok', 'youtube_shorts')),
  platform text,
  subject text,
  body text,
  preview_text text,
  media_url text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sent', 'failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_subscribers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  phone text,
  full_name text,
  city text,
  state text,
  source text not null default 'admin',
  email_opt_in boolean not null default false,
  sms_opt_in boolean not null default false,
  email_opted_in_at timestamptz,
  sms_opted_in_at timestamptz,
  email_opted_out_at timestamptz,
  sms_opted_out_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid(),
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_subscribers_email_or_phone check (email is not null or phone is not null)
);

create unique index if not exists marketing_subscribers_email_uidx on public.marketing_subscribers (lower(email)) where email is not null;
create unique index if not exists marketing_subscribers_phone_uidx on public.marketing_subscribers (phone) where phone is not null;
create index if not exists marketing_subscribers_opt_in_idx on public.marketing_subscribers (email_opt_in, sms_opt_in);

create table if not exists public.marketing_send_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  message_id uuid references public.marketing_messages(id) on delete set null,
  subscriber_id uuid references public.marketing_subscribers(id) on delete set null,
  user_id uuid,
  channel text not null check (channel in ('email', 'sms', 'instagram', 'tiktok', 'youtube_shorts')),
  provider text,
  recipient_email text,
  recipient_phone text,
  platform text,
  platform_post_id text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped', 'opened', 'clicked', 'unsubscribed')),
  error_message text,
  provider_response jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists marketing_send_logs_no_duplicate_success_email
  on public.marketing_send_logs (campaign_id, channel, lower(recipient_email))
  where status = 'sent' and recipient_email is not null;

create unique index if not exists marketing_send_logs_no_duplicate_success_sms
  on public.marketing_send_logs (campaign_id, channel, recipient_phone)
  where status = 'sent' and recipient_phone is not null;

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.marketing_campaigns(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'tiktok', 'youtube_shorts')),
  caption text,
  title text,
  description text,
  hashtags text[] not null default '{}',
  voiceover_script text,
  cta text,
  location_promo_text text,
  media_url text,
  image_suggestions text[] not null default '{}',
  video_suggestions text[] not null default '{}',
  platform_post_id text,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'posted', 'failed')),
  scheduled_at timestamptz,
  posted_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_marketing_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  phone text,
  email_opt_in boolean not null default false,
  sms_opt_in boolean not null default false,
  email_opted_out_at timestamptz,
  sms_opted_out_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid(),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_marketing_preferences_contact check (user_id is not null or email is not null or phone is not null)
);

create unique index if not exists user_marketing_preferences_user_uidx on public.user_marketing_preferences (user_id) where user_id is not null;
create unique index if not exists user_marketing_preferences_email_uidx on public.user_marketing_preferences (lower(email)) where email is not null;
create unique index if not exists user_marketing_preferences_phone_uidx on public.user_marketing_preferences (phone) where phone is not null;

create index if not exists marketing_campaigns_status_idx on public.marketing_campaigns (status, scheduled_at);
create index if not exists marketing_campaigns_location_idx on public.marketing_campaigns (location_source_type, location_source_id);
create index if not exists marketing_send_logs_campaign_channel_idx on public.marketing_send_logs (campaign_id, channel, status);
create index if not exists social_posts_campaign_platform_idx on public.social_posts (campaign_id, platform);
