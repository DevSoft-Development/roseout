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
  add column if not exists visit_verification_level text,
  add column if not exists source_search_id text,
  add column if not exists source_query text,
  add column if not exists plan_title text,
  add column if not exists restaurant_location_id uuid null,
  add column if not exists activity_location_id uuid null,
  add column if not exists saved_at timestamptz null;

alter table public.outings drop constraint if exists outings_status_check;

alter table public.outings
  add constraint outings_status_check check (
    status in (
      'planned',
      'saved',
      'reservation_clicked',
      'call_clicked',
      'link_clicked',
      'reminder_scheduled',
      'reminder_sent',
      'feedback_requested',
      'completed',
      'completed_no_feedback',
      'cancelled'
    )
  );

alter table public.outings drop constraint if exists outings_created_by_type_check;
alter table public.outings
  add constraint outings_created_by_type_check check (
    created_by_type in ('guest','user','admin','ambassador')
  );

alter table public.outings drop constraint if exists outings_time_confidence_check;
alter table public.outings
  add constraint outings_time_confidence_check check (
    outing_time_confidence in ('none','date_only','exact') or outing_time_confidence is null
  );

create index if not exists idx_outings_guest_email_created_at on public.outings (guest_email, created_at desc);
create index if not exists idx_outings_guest_session_created_at on public.outings (guest_session_id, created_at desc);
create index if not exists idx_outings_plan_access_token on public.outings (plan_access_token);
create index if not exists outings_restaurant_location_id_idx on public.outings (restaurant_location_id);
create index if not exists outings_activity_location_id_idx on public.outings (activity_location_id);
create index if not exists outings_saved_at_idx on public.outings (saved_at desc);
