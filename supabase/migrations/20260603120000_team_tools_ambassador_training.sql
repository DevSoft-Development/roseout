-- Team Tools / Ambassador Training foundation for TheOutHaven CRM.
-- Safe, idempotent migration. Clock-in/out is time-only; GPS fields are only on site-visit/proof workflows.

create extension if not exists pgcrypto;

create table if not exists public.team_member_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  team_type text not null,
  status text not null default 'active',
  pay_type text default 'hourly',
  hourly_rate numeric,
  include_in_payroll boolean default false,
  can_clock_in boolean default true,
  can_track_work boolean default true,
  can_do_site_visits boolean default false,
  can_do_social_outreach boolean default false,
  can_work_support_tickets boolean default false,
  can_use_demo_mode boolean default true,
  allowed_work_types text[] default '{}'::text[],
  manager_id uuid,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint team_member_profiles_team_type_check check (team_type in ('ambassador','experience_team','sales_team','support_team','manager','superadmin')),
  constraint team_member_profiles_status_check check (status in ('active','inactive','suspended','training','archived')),
  constraint team_member_profiles_pay_type_check check (pay_type in ('hourly','commission','hourly_plus_commission','contractor','training_only','owner_or_training','unpaid'))
);

create index if not exists idx_team_member_profiles_user_id on public.team_member_profiles(user_id);
create index if not exists idx_team_member_profiles_team_type on public.team_member_profiles(team_type);
create index if not exists idx_team_member_profiles_status on public.team_member_profiles(status);

create or replace function public.team_tools_global_work_types()
returns text[]
language sql
stable
as $$
  select array[
    'field_visit','site_visit','social_outreach','phone_outreach','email_outreach','customer_support','owner_support','reservation_support','claim_support','listing_review','photo_review','quality_review','crm_cleanup','support_ticket','follow_up','email_follow_up','phone_follow_up','claim_code_delivery','qr_dropoff','owner_meeting','reservation_setup','reservation_demo','onboarding_support','team_review','payroll_review','proof_review','training','demo','admin_work','other'
  ]::text[];
$$;

create or replace function public.get_allowed_work_types_for_team_type(p_team_type text)
returns text[]
language sql
stable
as $$
  select case p_team_type
    when 'ambassador' then array['field_visit','site_visit','social_outreach','phone_outreach','email_outreach','follow_up','claim_code_delivery','qr_dropoff','owner_meeting','reservation_setup','training','demo','other']::text[]
    when 'experience_team' then array['customer_support','owner_support','reservation_support','claim_support','support_ticket','listing_review','photo_review','quality_review','crm_cleanup','email_follow_up','phone_follow_up','training','admin_work','other']::text[]
    when 'sales_team' then array['social_outreach','phone_outreach','email_outreach','follow_up','owner_meeting','claim_code_delivery','reservation_demo','onboarding_support','training','admin_work','other']::text[]
    when 'support_team' then array['customer_support','owner_support','reservation_support','claim_support','support_ticket','email_follow_up','phone_follow_up','admin_work','training','other']::text[]
    when 'manager' then array['team_review','payroll_review','proof_review','quality_review','crm_cleanup','support_ticket','training','admin_work','other']::text[]
    when 'superadmin' then public.team_tools_global_work_types()
    else array[]::text[]
  end;
$$;

create or replace function public.get_allowed_work_types_for_user(p_user_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.team_member_profiles%rowtype;
begin
  select * into v_profile from public.team_member_profiles where user_id = p_user_id and status in ('active','training') limit 1;
  if not found then
    return array[]::text[];
  end if;
  if coalesce(array_length(v_profile.allowed_work_types, 1), 0) > 0 then
    return v_profile.allowed_work_types;
  end if;
  return public.get_allowed_work_types_for_team_type(v_profile.team_type);
end;
$$;

create or replace function public.is_work_type_allowed_for_user(p_user_id uuid, p_work_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_work_type = any(public.get_allowed_work_types_for_user(p_user_id)), false);
$$;

create table if not exists public.team_work_sessions (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid references public.team_member_profiles(id) on delete set null,
  user_id uuid not null,
  team_type text,
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  total_minutes integer,
  break_minutes integer default 0,
  work_type text not null default 'admin_work',
  status text not null default 'active',
  approval_status text not null default 'pending_review',
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  admin_notes text,
  user_notes text,
  device_id text,
  device_name text,
  is_remote boolean default true,
  is_training boolean default false,
  is_demo boolean default false,
  demo_session_id uuid,
  paid_travel_minutes integer default 0,
  mileage numeric default 0,
  reimbursement_amount numeric default 0,
  payroll_batch_id uuid,
  exported_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint team_work_sessions_status_check check (status in ('active','completed','needs_correction','approved','rejected','exported','paid')),
  constraint team_work_sessions_approval_status_check check (approval_status in ('pending_review','approved','rejected','needs_correction'))
);

create unique index if not exists idx_team_work_sessions_one_active on public.team_work_sessions(user_id) where status = 'active';
create index if not exists idx_team_work_sessions_member on public.team_work_sessions(team_member_id);
create index if not exists idx_team_work_sessions_period on public.team_work_sessions(clock_in_at, clock_out_at);
create index if not exists idx_team_work_sessions_payroll on public.team_work_sessions(approval_status, exported_at);

create table if not exists public.team_work_activities (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid references public.team_member_profiles(id) on delete set null,
  user_id uuid not null,
  work_session_id uuid references public.team_work_sessions(id) on delete set null,
  activity_type text not null,
  source_type text,
  source_id uuid,
  location_id uuid,
  location_source text default 'real',
  demo_session_id uuid,
  started_at timestamptz default now(),
  ended_at timestamptz,
  minutes_spent integer,
  status text default 'completed',
  notes text,
  manager_review_status text default 'pending_review',
  reviewed_by uuid,
  reviewed_at timestamptz,
  payroll_eligible boolean default true,
  ticket_number text,
  ticket_status_before text,
  ticket_status_after text,
  ticket_action text,
  ticket_completed_at timestamptz,
  ticket_resolved_at timestamptz,
  ticket_closed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_team_work_activities_session on public.team_work_activities(work_session_id);
create index if not exists idx_team_work_activities_ticket on public.team_work_activities(source_type, source_id, ticket_action);
create index if not exists idx_team_work_activities_location on public.team_work_activities(location_id);

alter table public.locations add column if not exists created_source text;
alter table public.locations add column if not exists created_by_team_member_id uuid;
alter table public.locations add column if not exists created_by_ambassador_id uuid;
alter table public.locations add column if not exists created_during_work_session_id uuid;
alter table public.locations add column if not exists created_during_site_visit_id uuid;
alter table public.locations add column if not exists admin_review_status text default 'pending_review';
alter table public.locations add column if not exists public_visibility_tier text;
alter table public.locations add column if not exists quality_status text;
alter table public.locations add column if not exists is_searchable boolean;
alter table public.locations add column if not exists is_demo boolean default false;
alter table public.locations add column if not exists training_only boolean default false;
alter table public.locations add column if not exists latitude numeric;
alter table public.locations add column if not exists longitude numeric;
alter table public.locations add column if not exists geocoded_address text;
alter table public.locations add column if not exists geocode_provider text;
alter table public.locations add column if not exists geocode_place_id text;
alter table public.locations add column if not exists geocoded_at timestamptz;
create index if not exists idx_locations_team_internal_review on public.locations(created_source, admin_review_status);

create table if not exists public.ambassador_site_visits (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid references public.team_member_profiles(id) on delete set null,
  ambassador_id uuid,
  user_id uuid not null,
  work_session_id uuid references public.team_work_sessions(id) on delete set null,
  location_id uuid,
  location_source text not null default 'real',
  demo_session_id uuid,
  visit_started_at timestamptz default now(),
  visit_ended_at timestamptz,
  visit_duration_minutes integer,
  visit_type text default 'initial_visit',
  visit_outcome text,
  notes text,
  follow_up_required boolean default false,
  follow_up_at timestamptz,
  check_in_latitude numeric,
  check_in_longitude numeric,
  check_in_accuracy_meters numeric,
  check_in_reverse_geocoded_address text,
  check_in_place_name text,
  business_latitude numeric,
  business_longitude numeric,
  distance_from_business_meters numeric,
  location_verification_status text default 'needs_review',
  photo_required boolean default true,
  photo_uploaded boolean default false,
  manager_review_status text default 'pending_review',
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_ambassador_site_visits_member on public.ambassador_site_visits(team_member_id, visit_started_at);
create index if not exists idx_ambassador_site_visits_location on public.ambassador_site_visits(location_id);

create table if not exists public.team_proofs (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid references public.team_member_profiles(id) on delete set null,
  ambassador_id uuid,
  user_id uuid not null,
  location_id uuid,
  location_source text not null default 'real',
  demo_session_id uuid,
  source_type text not null,
  source_id uuid,
  proof_type text not null,
  file_url text not null,
  storage_bucket text,
  storage_path text,
  caption text,
  latitude numeric,
  longitude numeric,
  accuracy_meters numeric,
  reverse_geocoded_address text,
  uploaded_at timestamptz default now(),
  manager_review_status text default 'pending_review',
  approved_for_public_use boolean default false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_team_proofs_review on public.team_proofs(manager_review_status, uploaded_at);
create index if not exists idx_team_proofs_source on public.team_proofs(source_type, source_id);

create table if not exists public.location_social_profiles (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  location_source text not null default 'real',
  platform text not null,
  handle text,
  profile_url text,
  is_primary boolean default false,
  is_verified boolean default false,
  source text default 'team_added',
  added_by uuid,
  last_verified_at timestamptz,
  status text default 'needs_review',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_location_social_profiles_location on public.location_social_profiles(location_id);

create table if not exists public.ambassador_social_outreach (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid references public.team_member_profiles(id) on delete set null,
  assigned_team_member_id uuid,
  assigned_ambassador_id uuid,
  user_id uuid not null,
  work_session_id uuid references public.team_work_sessions(id) on delete set null,
  location_id uuid,
  location_source text not null default 'real',
  demo_session_id uuid,
  social_profile_id uuid references public.location_social_profiles(id) on delete set null,
  platform text not null,
  handle_or_url text,
  outreach_stage text default 'not_started',
  message_status text default 'not_sent',
  reply_status text default 'no_reply',
  template_id uuid,
  template_version integer,
  message_sent_at timestamptz,
  last_contacted_at timestamptz,
  follow_up_at timestamptz,
  claim_code_sent boolean default false,
  claim_code_id uuid,
  proof_required boolean default true,
  proof_uploaded boolean default false,
  notes text,
  manager_review_status text default 'pending_review',
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_ambassador_social_outreach_member on public.ambassador_social_outreach(team_member_id, created_at);
create index if not exists idx_ambassador_social_outreach_location on public.ambassador_social_outreach(location_id);

create table if not exists public.social_outreach_templates (
  id uuid primary key default gen_random_uuid(),
  template_name text not null,
  platform text default 'all',
  template_type text not null,
  subject text,
  message_body text not null,
  version integer not null default 1,
  is_active boolean default true,
  requires_manager_approval boolean default false,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists idx_social_outreach_templates_unique_version on public.social_outreach_templates(template_name, platform, template_type, version);
insert into public.social_outreach_templates (template_name, platform, template_type, subject, message_body)
values
  ('General intro','all','general_intro',null,'Hi {{business_name}} — I’m with TheOutHaven. We help locals discover places to eat and things to do, and I wanted to share a quick way to claim your free business profile.'),
  ('Follow-up','all','follow_up_message',null,'Hi {{business_name}}, just following up on my note about your TheOutHaven profile. Happy to help you claim it or answer any questions.'),
  ('Claim code invite','all','claim_code_message',null,'Here is your TheOutHaven claim invite for {{business_name}}: {{claim_link}}. It lets your team manage profile details securely.'),
  ('Reservation widget demo invite','all','reservation_widget_message',null,'We can also show a quick demo of TheOutHaven Reserve for {{business_name}} so guests can book from your profile without changing your current workflow.')
on conflict do nothing;

create table if not exists public.team_follow_ups (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid references public.team_member_profiles(id) on delete set null,
  user_id uuid,
  location_id uuid,
  location_source text not null default 'real',
  demo_session_id uuid,
  source_type text not null,
  source_id uuid,
  follow_up_at timestamptz not null,
  follow_up_channel text not null,
  status text default 'pending',
  notes text,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_team_follow_ups_due on public.team_follow_ups(status, follow_up_at);

create table if not exists public.crm_demo_locations (
  id uuid primary key default gen_random_uuid(),
  demo_name text not null,
  slug text unique,
  demo_type text not null,
  location_type text not null,
  category text,
  cuisine text,
  activity_type text,
  address text,
  city text,
  state text,
  zip_code text,
  latitude numeric,
  longitude numeric,
  phone text,
  website text,
  instagram text,
  facebook text,
  tiktok text,
  description text,
  image_url text,
  is_master_template boolean default true,
  is_active boolean default true,
  is_editable boolean default false,
  training_only boolean default true,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
insert into public.crm_demo_locations (demo_name, slug, demo_type, location_type, category, cuisine, activity_type, address, city, state, zip_code, phone, website, instagram, description)
values
  ('TheOutHaven Demo Bistro','theouthaven-demo-bistro','restaurant_training','restaurant','Dinner / Casual Dining','American / Caribbean Fusion',null,'123 Demo Avenue','Brooklyn','NY','11201','(555) 010-1000','https://theouthaven.com/demo-bistro','@theouthaven_demo_bistro','Training restaurant for CRM, claims, social outreach, and reservation demo workflows.'),
  ('TheOutHaven Demo Social Club','theouthaven-demo-social-club','activity_training','activity','Bowling / Axe Throwing / Games',null,'bowling, axe throwing','456 Demo Street','Queens','NY','11429','(555) 010-2000','https://theouthaven.com/demo-social-club','@theouthaven_demo_social','Training activity venue for team onboarding and reservation layout practice.')
on conflict (slug) do update set demo_name = excluded.demo_name, updated_at = now();

create table if not exists public.crm_demo_sessions (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid references public.team_member_profiles(id) on delete set null,
  ambassador_id uuid,
  user_id uuid,
  created_by uuid,
  master_demo_location_id uuid references public.crm_demo_locations(id) on delete cascade,
  session_name text,
  session_type text default 'personal',
  started_at timestamptz default now(),
  expires_at timestamptz,
  status text default 'active',
  created_for text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_crm_demo_sessions_user_status on public.crm_demo_sessions(user_id, status);

create table if not exists public.crm_demo_session_locations (
  id uuid primary key default gen_random_uuid(),
  demo_session_id uuid references public.crm_demo_sessions(id) on delete cascade,
  master_demo_location_id uuid references public.crm_demo_locations(id) on delete set null,
  display_name text not null,
  location_type text,
  category text,
  cuisine text,
  activity_type text,
  address text,
  city text,
  state text,
  zip_code text,
  latitude numeric,
  longitude numeric,
  phone text,
  website text,
  instagram text,
  facebook text,
  tiktok text,
  description text,
  image_url text,
  editable_data_json jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_crm_demo_session_locations_session on public.crm_demo_session_locations(demo_session_id);

create table if not exists public.team_payroll_batches (
  id uuid primary key default gen_random_uuid(),
  pay_period_start date not null,
  pay_period_end date not null,
  status text default 'generated',
  exported_by uuid,
  exported_at timestamptz default now(),
  total_team_members integer default 0,
  total_approved_hours numeric default 0,
  total_paid_travel_hours numeric default 0,
  total_estimated_pay numeric default 0,
  summary_csv_url text,
  detail_csv_url text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.team_payroll_batch_items (
  id uuid primary key default gen_random_uuid(),
  payroll_batch_id uuid references public.team_payroll_batches(id) on delete cascade,
  team_member_id uuid references public.team_member_profiles(id) on delete set null,
  user_id uuid not null,
  work_session_id uuid references public.team_work_sessions(id) on delete set null,
  approved_minutes integer default 0,
  paid_travel_minutes integer default 0,
  mileage numeric default 0,
  reimbursement_amount numeric default 0,
  hourly_rate numeric,
  gross_pay numeric,
  commission numeric default 0,
  bonus numeric default 0,
  total_pay numeric,
  created_at timestamptz default now()
);

create table if not exists public.crm_demo_reset_logs (
  id uuid primary key default gen_random_uuid(),
  reset_type text not null,
  status text not null,
  sessions_deleted integer default 0,
  records_deleted jsonb default '{}'::jsonb,
  error_message text,
  started_at timestamptz default now(),
  finished_at timestamptz,
  triggered_by uuid,
  created_at timestamptz default now()
);

-- Optional support ticket metadata columns. Existing support_tickets remains source of truth.
alter table if exists public.support_tickets add column if not exists assigned_team_member_id uuid;
alter table if exists public.support_tickets add column if not exists last_work_session_id uuid;
alter table if exists public.support_tickets add column if not exists total_tracked_minutes integer default 0;
alter table if exists public.support_tickets add column if not exists answered_at timestamptz;
alter table if exists public.support_tickets add column if not exists marked_complete_at timestamptz;
alter table if exists public.support_tickets add column if not exists resolved_at timestamptz;
alter table if exists public.support_tickets add column if not exists closed_at timestamptz;
alter table if exists public.support_tickets add column if not exists completed_by_team_member_id uuid;
alter table if exists public.support_tickets add column if not exists manager_review_status text;
alter table if exists public.support_tickets add column if not exists payroll_eligible boolean default true;

-- Reservation demo mode extension. Safe no-op where table names do not exist.
do $$
declare
  r record;
begin
  for r in select table_schema, table_name from information_schema.tables where table_schema = 'public' and table_name in ('reservations','reservation_layouts','reservation_tables','reservation_bookings','reservation_slots','location_reservation_layouts') loop
    execute format('alter table %I.%I add column if not exists location_source text default %L', r.table_schema, r.table_name, 'real');
    execute format('alter table %I.%I add column if not exists demo_session_id uuid', r.table_schema, r.table_name);
    execute format('alter table %I.%I add column if not exists is_demo boolean default false', r.table_schema, r.table_name);
  end loop;
end $$;

create or replace function public.start_team_work_session(
  p_work_type text,
  p_device_id text default null,
  p_device_name text default null,
  p_is_training boolean default false,
  p_is_demo boolean default false,
  p_demo_session_id uuid default null,
  p_user_notes text default null
)
returns public.team_work_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.team_member_profiles%rowtype;
  v_session public.team_work_sessions%rowtype;
  v_is_remote boolean := true;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  select * into v_profile from public.team_member_profiles where user_id = v_user_id and status in ('active','training') limit 1;
  if not found then
    raise exception 'A team member profile is required before clocking in.';
  end if;
  if coalesce(v_profile.can_clock_in, false) is not true or coalesce(v_profile.can_track_work, false) is not true then
    raise exception 'Clock-in is not enabled for your team profile.';
  end if;
  if not public.is_work_type_allowed_for_user(v_user_id, p_work_type) then
    raise exception 'This work type is not allowed for your team profile.';
  end if;
  if exists (select 1 from public.team_work_sessions where user_id = v_user_id and status = 'active') then
    raise exception 'You already have an active work session.';
  end if;
  v_is_remote := case when v_profile.team_type in ('experience_team','support_team') or p_work_type in ('social_outreach','phone_outreach','email_outreach','customer_support','owner_support','reservation_support','claim_support','support_ticket','admin_work') then true else false end;
  insert into public.team_work_sessions(team_member_id,user_id,team_type,work_type,device_id,device_name,is_remote,is_training,is_demo,demo_session_id,user_notes)
  values (v_profile.id, v_user_id, v_profile.team_type, p_work_type, p_device_id, p_device_name, v_is_remote, p_is_training, p_is_demo, p_demo_session_id, p_user_notes)
  returning * into v_session;
  return v_session;
end;
$$;

create or replace function public.end_team_work_session(p_session_id uuid, p_user_notes text default null)
returns public.team_work_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.team_work_sessions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  select * into v_session from public.team_work_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Work session not found.';
  end if;
  if v_session.user_id <> v_user_id and not exists (select 1 from public.admin_users where user_id = v_user_id and role in ('superadmin','admin')) then
    raise exception 'You cannot end this work session.';
  end if;
  update public.team_work_sessions
  set clock_out_at = now(),
      total_minutes = greatest(1, ceil(extract(epoch from (now() - clock_in_at)) / 60.0)::integer - coalesce(break_minutes,0)),
      status = 'completed',
      approval_status = 'pending_review',
      user_notes = coalesce(p_user_notes, user_notes),
      updated_at = now()
  where id = p_session_id
  returning * into v_session;
  return v_session;
end;
$$;

create or replace function public.create_demo_session_from_template(p_master_demo_location_id uuid, p_session_type text default 'personal')
returns table(session_id uuid, session_location_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.team_member_profiles%rowtype;
  v_master public.crm_demo_locations%rowtype;
  v_session_id uuid;
  v_session_location_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  select * into v_profile from public.team_member_profiles where user_id = v_user_id and status in ('active','training') limit 1;
  if not found or coalesce(v_profile.can_use_demo_mode, false) is not true then raise exception 'Demo mode is not enabled for your team profile.'; end if;
  select * into v_master from public.crm_demo_locations where id = p_master_demo_location_id and is_active = true limit 1;
  if not found then raise exception 'Demo template not found.'; end if;
  insert into public.crm_demo_sessions(team_member_id,user_id,created_by,master_demo_location_id,session_name,session_type,expires_at,created_for)
  values (v_profile.id, v_user_id, v_user_id, v_master.id, v_master.demo_name || ' — ' || initcap(coalesce(p_session_type,'personal')), coalesce(p_session_type,'personal'), now() + interval '12 hours', v_profile.team_type)
  returning id into v_session_id;
  insert into public.crm_demo_session_locations(demo_session_id,master_demo_location_id,display_name,location_type,category,cuisine,activity_type,address,city,state,zip_code,latitude,longitude,phone,website,instagram,facebook,tiktok,description,image_url)
  values (v_session_id,v_master.id,v_master.demo_name,v_master.location_type,v_master.category,v_master.cuisine,v_master.activity_type,v_master.address,v_master.city,v_master.state,v_master.zip_code,v_master.latitude,v_master.longitude,v_master.phone,v_master.website,v_master.instagram,v_master.facebook,v_master.tiktok,v_master.description,v_master.image_url)
  returning id into v_session_location_id;
  return query select v_session_id, v_session_location_id;
end;
$$;

create or replace function public.reset_demo_session(p_demo_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.team_proofs where demo_session_id = p_demo_session_id;
  delete from public.ambassador_social_outreach where demo_session_id = p_demo_session_id;
  delete from public.ambassador_site_visits where demo_session_id = p_demo_session_id;
  delete from public.team_follow_ups where demo_session_id = p_demo_session_id;
  delete from public.crm_demo_session_locations where demo_session_id = p_demo_session_id;
  update public.crm_demo_sessions set status = 'reset', updated_at = now() where id = p_demo_session_id;
  return true;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['team_member_profiles','team_work_sessions','team_work_activities','location_social_profiles','ambassador_social_outreach','team_follow_ups','crm_demo_locations','crm_demo_sessions','crm_demo_session_locations'] loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- RLS: public cannot access team/demo data. Service role/admin APIs bypass RLS; team users can access own records through RPCs/routes.
alter table public.team_member_profiles enable row level security;
alter table public.team_work_sessions enable row level security;
alter table public.team_work_activities enable row level security;
alter table public.ambassador_site_visits enable row level security;
alter table public.team_proofs enable row level security;
alter table public.location_social_profiles enable row level security;
alter table public.ambassador_social_outreach enable row level security;
alter table public.social_outreach_templates enable row level security;
alter table public.team_follow_ups enable row level security;
alter table public.crm_demo_locations enable row level security;
alter table public.crm_demo_sessions enable row level security;
alter table public.crm_demo_session_locations enable row level security;
alter table public.team_payroll_batches enable row level security;
alter table public.team_payroll_batch_items enable row level security;

-- Policies are deliberately additive/idempotent.
do $$
begin
  create policy team_profiles_own_read on public.team_member_profiles for select using (user_id = auth.uid() or exists (select 1 from public.admin_users where user_id = auth.uid() and role in ('superadmin','admin','experience')));
exception when duplicate_object then null;
end $$;
do $$
begin
  create policy team_sessions_own_all on public.team_work_sessions for all using (user_id = auth.uid() or exists (select 1 from public.admin_users where user_id = auth.uid() and role in ('superadmin','admin','experience'))) with check (user_id = auth.uid() or exists (select 1 from public.admin_users where user_id = auth.uid() and role in ('superadmin','admin')));
exception when duplicate_object then null;
end $$;
do $$
begin
  create policy team_activities_own_all on public.team_work_activities for all using (user_id = auth.uid() or exists (select 1 from public.admin_users where user_id = auth.uid() and role in ('superadmin','admin','experience'))) with check (user_id = auth.uid() or exists (select 1 from public.admin_users where user_id = auth.uid() and role in ('superadmin','admin','experience')));
exception when duplicate_object then null;
end $$;

-- Cron setup notes (replace <project-ref> and use Vault/env secrets in deployed projects):
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('team-tools-nightly-demo-reset', '0 8 * * *', $$ select net.http_post(url := 'https://<project-ref>.functions.supabase.co/nightly-demo-reset', headers := jsonb_build_object('Authorization','Bearer ' || current_setting('app.supabase_service_role_key', true))) $$);
