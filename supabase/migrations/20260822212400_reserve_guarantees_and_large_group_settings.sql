alter table public.locations
  add column if not exists reservation_guarantee_enabled boolean not null default false,
  add column if not exists reservation_cancel_cutoff_hours integer not null default 6,
  add column if not exists reservation_late_cancel_fee_type text not null default 'flat',
  add column if not exists reservation_late_cancel_fee_cents integer not null default 0,
  add column if not exists reservation_no_show_fee_type text not null default 'flat',
  add column if not exists reservation_no_show_fee_cents integer not null default 0,
  add column if not exists large_group_booking_enabled boolean not null default false,
  add column if not exists large_group_min_party_size integer not null default 8,
  add column if not exists large_group_max_party_size integer not null default 40,
  add column if not exists large_group_confirmation_mode text not null default 'approval',
  add column if not exists large_group_payment_mode text not null default 'none',
  add column if not exists large_group_deposit_type text not null default 'flat',
  add column if not exists large_group_deposit_amount_cents integer not null default 0,
  add column if not exists large_group_prix_fixe_mode text not null default 'optional',
  add column if not exists large_group_default_duration_minutes integer not null default 180;

alter table public.locations drop constraint if exists locations_reservation_fee_type_check;
alter table public.locations add constraint locations_reservation_fee_type_check check (reservation_late_cancel_fee_type in ('flat','per_person') and reservation_no_show_fee_type in ('flat','per_person'));
alter table public.locations drop constraint if exists locations_large_group_confirmation_mode_check;
alter table public.locations add constraint locations_large_group_confirmation_mode_check check (large_group_confirmation_mode in ('instant','approval'));
alter table public.locations drop constraint if exists locations_large_group_payment_mode_check;
alter table public.locations add constraint locations_large_group_payment_mode_check check (large_group_payment_mode in ('none','card_guarantee','deposit'));
alter table public.locations drop constraint if exists locations_large_group_deposit_type_check;
alter table public.locations add constraint locations_large_group_deposit_type_check check (large_group_deposit_type in ('flat','per_person'));
alter table public.locations drop constraint if exists locations_large_group_prix_fixe_mode_check;
alter table public.locations add constraint locations_large_group_prix_fixe_mode_check check (large_group_prix_fixe_mode in ('none','optional','required'));
alter table public.locations drop constraint if exists locations_reserve_policy_amounts_check;
alter table public.locations add constraint locations_reserve_policy_amounts_check check (
  reservation_cancel_cutoff_hours between 0 and 168 and
  reservation_late_cancel_fee_cents >= 0 and
  reservation_no_show_fee_cents >= 0 and
  large_group_min_party_size between 2 and 500 and
  large_group_max_party_size between large_group_min_party_size and 500 and
  large_group_deposit_amount_cents >= 0 and
  large_group_default_duration_minutes between 30 and 1440
);

alter table public.location_reservations
  add column if not exists guarantee_required boolean not null default false,
  add column if not exists guarantee_status text not null default 'not_required',
  add column if not exists guarantee_cancel_cutoff_hours integer,
  add column if not exists guarantee_late_cancel_fee_type text,
  add column if not exists guarantee_late_cancel_fee_cents integer,
  add column if not exists guarantee_no_show_fee_type text,
  add column if not exists guarantee_no_show_fee_cents integer,
  add column if not exists stripe_setup_intent_id text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists guarantee_authorized_at timestamptz,
  add column if not exists guarantee_released_at timestamptz,
  add column if not exists guarantee_charged_at timestamptz,
  add column if not exists guarantee_charge_payment_intent_id text,
  add column if not exists large_group_payment_mode text;

alter table public.location_reservations drop constraint if exists location_reservations_guarantee_status_check;
alter table public.location_reservations add constraint location_reservations_guarantee_status_check check (guarantee_status in ('not_required','pending','active','released','charged','failed','waived'));
alter table public.location_reservations drop constraint if exists location_reservations_guarantee_fee_type_check;
alter table public.location_reservations add constraint location_reservations_guarantee_fee_type_check check (
  (guarantee_late_cancel_fee_type is null or guarantee_late_cancel_fee_type in ('flat','per_person')) and
  (guarantee_no_show_fee_type is null or guarantee_no_show_fee_type in ('flat','per_person'))
);
alter table public.location_reservations drop constraint if exists location_reservations_large_group_payment_mode_check;
alter table public.location_reservations add constraint location_reservations_large_group_payment_mode_check check (large_group_payment_mode is null or large_group_payment_mode in ('none','card_guarantee','deposit'));

create index if not exists location_reservations_guarantee_pending_idx on public.location_reservations(location_id,reservation_date,reservation_time) where guarantee_required and guarantee_status in ('pending','active');
create index if not exists location_reservations_setup_intent_idx on public.location_reservations(stripe_setup_intent_id) where stripe_setup_intent_id is not null;
