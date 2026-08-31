-- Clean plan completion and conversion tracking.
-- Safe/idempotent: only adds missing columns/indexes and widens the existing status constraint.

alter table public.outings
  add column if not exists plan_title text null,
  add column if not exists source_query text null,
  add column if not exists restaurant_location_id uuid null,
  add column if not exists activity_location_id uuid null,
  add column if not exists saved_at timestamptz null,
  add column if not exists last_link_clicked_at timestamptz null,
  add column if not exists last_link_clicked_type text null,
  add column if not exists link_click_count integer not null default 0,
  add column if not exists confirmation_viewed_at timestamptz null,
  add column if not exists completed_no_feedback_at timestamptz null,
  add column if not exists completion_inferred_at timestamptz null,
  add column if not exists completion_inferred_reason text null;

alter table public.outings
  drop constraint if exists outings_status_check;

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

create index if not exists outings_restaurant_location_id_idx on public.outings (restaurant_location_id);
create index if not exists outings_activity_location_id_idx on public.outings (activity_location_id);
create index if not exists outings_saved_at_idx on public.outings (saved_at desc);
create index if not exists outings_last_link_clicked_at_idx on public.outings (last_link_clicked_at desc);
create index if not exists outings_completion_inferred_at_idx on public.outings (completion_inferred_at desc);
