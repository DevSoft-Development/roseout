create extension if not exists pgcrypto;

alter table public.outings
  add column if not exists guest_session_id text,
  add column if not exists guest_email text,
  add column if not exists guest_phone text,
  add column if not exists guest_name text,
  add column if not exists email_opt_in boolean not null default false,
  add column if not exists sms_opt_in boolean not null default false,
  add column if not exists created_by_type text not null default 'guest',
  add column if not exists plan_access_token text unique,
  add column if not exists plan_access_token_expires_at timestamptz,
  add column if not exists confirm_token text unique,
  add column if not exists confirm_token_expires_at timestamptz,
  add column if not exists planned_for timestamptz,
  add column if not exists timezone text default 'America/New_York',
  add column if not exists outing_date_context text,
  add column if not exists outing_time_confidence text,
  add column if not exists reminders_enabled boolean not null default false,
  add column if not exists next_morning_followup_enabled boolean not null default false,
  add column if not exists next_morning_followup_date timestamptz,
  add column if not exists reminder_2h_sent_at timestamptz,
  add column if not exists reminder_30m_sent_at timestamptz,
  add column if not exists next_morning_followup_sent_at timestamptz,
  add column if not exists review_request_sent_at timestamptz,
  add column if not exists likely_visit_at timestamptz,
  add column if not exists attendance_confirmed_at timestamptz,
  add column if not exists attendance_declined_at timestamptz,
  add column if not exists attendance_confirmed_source text,
  add column if not exists attendance_declined_source text,
  add column if not exists visit_verification_level text,
  add column if not exists visit_verification_source text,
  add column if not exists source_search_id text,
  add column if not exists source_query text;

alter table public.outings drop constraint if exists outings_created_by_type_check;
alter table public.outings add constraint outings_created_by_type_check check (created_by_type in ('guest','user','admin','ambassador'));
alter table public.outings drop constraint if exists outings_time_confidence_check;
alter table public.outings add constraint outings_time_confidence_check check (outing_time_confidence in ('none','date_only','exact') or outing_time_confidence is null);
alter table public.outings drop constraint if exists outings_visit_verification_level_check;
alter table public.outings add constraint outings_visit_verification_level_check check (visit_verification_level in ('planned','intent_confirmed','likely_visited','verified_visited') or visit_verification_level is null);
alter table public.outings drop constraint if exists outings_visit_verification_source_check;
alter table public.outings add constraint outings_visit_verification_source_check check (visit_verification_source in ('internal_reservation','check_in','admin','ambassador','guest_self_confirmed','user_self_confirmed','external_clicks') or visit_verification_source is null);
alter table public.outings drop constraint if exists outings_planned_time_consistency_check;
alter table public.outings add constraint outings_planned_time_consistency_check check (((outing_time_confidence = 'exact' and planned_for is not null) or (outing_time_confidence in ('none','date_only') and planned_for is null) or outing_time_confidence is null));
alter table public.outings drop constraint if exists outings_reminders_require_planned_for_check;
alter table public.outings add constraint outings_reminders_require_planned_for_check check (reminders_enabled = false or planned_for is not null);
alter table public.outings drop constraint if exists outings_guest_requires_plan_token_check;
alter table public.outings add constraint outings_guest_requires_plan_token_check check (created_by_type <> 'guest' or plan_access_token is not null);

create index if not exists idx_outings_guest_session_created_at on public.outings (guest_session_id, created_at desc);
create index if not exists idx_outings_guest_email_created_at on public.outings (guest_email, created_at desc);
create index if not exists idx_outings_plan_access_token on public.outings (plan_access_token);
create index if not exists idx_outings_confirm_token on public.outings (confirm_token);
create index if not exists idx_outings_planned_for on public.outings (planned_for);
create index if not exists idx_outings_confidence_followup_date on public.outings (outing_time_confidence, next_morning_followup_date);
create index if not exists idx_outings_followup_send on public.outings (next_morning_followup_enabled, next_morning_followup_sent_at);
create index if not exists idx_outings_attendance_confirmed_at on public.outings (attendance_confirmed_at);
create index if not exists idx_outings_visit_verification_level on public.outings (visit_verification_level);

alter table public.location_reviews
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists outing_id uuid references public.outings(id) on delete set null,
  add column if not exists reservation_id uuid,
  add column if not exists visit_id uuid,
  add column if not exists guest_session_id text,
  add column if not exists guest_email text,
  add column if not exists guest_name text,
  add column if not exists verified_visit boolean not null default false,
  add column if not exists verification_source text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid,
  add column if not exists review_token text unique,
  add column if not exists review_token_expires_at timestamptz,
  add column if not exists review_token_used_at timestamptz,
  add column if not exists status text not null default 'pending',
  add column if not exists moderation_notes text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid;

alter table public.location_reviews drop constraint if exists location_reviews_verification_source_check;
alter table public.location_reviews add constraint location_reviews_verification_source_check check (verification_source in ('outing_confirmed','internal_reservation','check_in','admin_verified','ambassador_verified','guest_followup','receipt_code') or verification_source is null);
alter table public.location_reviews drop constraint if exists location_reviews_status_check;
alter table public.location_reviews add constraint location_reviews_status_check check (status in ('pending','approved','rejected','flagged'));

create index if not exists idx_location_reviews_public_verified on public.location_reviews (location_id, status, verified_visit, created_at desc);
create index if not exists idx_location_reviews_outing_id on public.location_reviews (outing_id);
create index if not exists idx_location_reviews_reservation_id on public.location_reviews (reservation_id);
create index if not exists idx_location_reviews_review_token on public.location_reviews (review_token);
create index if not exists idx_location_reviews_guest_email on public.location_reviews (guest_email);
create index if not exists idx_location_reviews_user_created_at on public.location_reviews (user_id, created_at desc);
create unique index if not exists uniq_location_reviews_outing on public.location_reviews (outing_id) where outing_id is not null;
create unique index if not exists uniq_location_reviews_reservation on public.location_reviews (reservation_id) where reservation_id is not null;
create unique index if not exists uniq_location_reviews_review_token on public.location_reviews (review_token) where review_token is not null;

create table if not exists public.location_review_eligibility (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  outing_id uuid references public.outings(id) on delete cascade,
  reservation_id uuid,
  visit_id uuid,
  guest_session_id text,
  guest_email text,
  source text not null check (source in ('outing_confirmed','internal_reservation','check_in','admin_verified','ambassador_verified','guest_followup','receipt_code')),
  status text not null default 'eligible' check (status in ('eligible','reviewed','expired','revoked')),
  review_id uuid references public.location_reviews(id) on delete set null,
  review_token text not null unique,
  review_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_review_eligibility_location_status on public.location_review_eligibility (location_id, status, created_at desc);
create index if not exists idx_review_eligibility_user_status on public.location_review_eligibility (user_id, status, created_at desc);
create index if not exists idx_review_eligibility_guest_email_status on public.location_review_eligibility (guest_email, status, created_at desc);
create index if not exists idx_review_eligibility_outing on public.location_review_eligibility (outing_id);
create index if not exists idx_review_eligibility_reservation on public.location_review_eligibility (reservation_id);
create index if not exists idx_review_eligibility_token on public.location_review_eligibility (review_token);
create unique index if not exists uniq_review_eligibility_outing on public.location_review_eligibility (outing_id) where outing_id is not null;
create unique index if not exists uniq_review_eligibility_reservation on public.location_review_eligibility (reservation_id) where reservation_id is not null;
