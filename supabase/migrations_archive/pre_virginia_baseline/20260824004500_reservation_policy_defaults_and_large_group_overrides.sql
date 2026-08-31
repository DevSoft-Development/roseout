alter table public.locations
  add column if not exists reservation_no_show_grace_minutes integer not null default 15,
  add column if not exists large_group_cancel_cutoff_hours integer not null default 24,
  add column if not exists large_group_no_show_grace_minutes integer not null default 15,
  add column if not exists large_group_late_cancel_fee_type text not null default 'per_person',
  add column if not exists large_group_late_cancel_fee_cents integer not null default 2500,
  add column if not exists large_group_no_show_fee_type text not null default 'per_person',
  add column if not exists large_group_no_show_fee_cents integer not null default 5000;

alter table public.locations
  alter column reservation_cancel_cutoff_hours set default 6,
  alter column reservation_late_cancel_fee_type set default 'per_person',
  alter column reservation_late_cancel_fee_cents set default 1000,
  alter column reservation_no_show_fee_type set default 'per_person',
  alter column reservation_no_show_fee_cents set default 2000;

update public.locations
set reservation_late_cancel_fee_type = 'per_person',
    reservation_late_cancel_fee_cents = 1000,
    reservation_no_show_fee_type = 'per_person',
    reservation_no_show_fee_cents = 2000,
    reservation_no_show_grace_minutes = 15
where reservation_guarantee_enabled = false
  and reservation_late_cancel_fee_cents = 0
  and reservation_no_show_fee_cents = 0;

alter table public.locations drop constraint if exists locations_large_group_fee_type_check;
alter table public.locations add constraint locations_large_group_fee_type_check check (
  large_group_late_cancel_fee_type in ('flat','per_person') and
  large_group_no_show_fee_type in ('flat','per_person')
);

alter table public.locations drop constraint if exists locations_reserve_policy_timing_check;
alter table public.locations add constraint locations_reserve_policy_timing_check check (
  reservation_no_show_grace_minutes between 0 and 180 and
  large_group_cancel_cutoff_hours between 0 and 336 and
  large_group_no_show_grace_minutes between 0 and 180 and
  large_group_late_cancel_fee_cents >= 0 and
  large_group_no_show_fee_cents >= 0
);

alter table public.location_reservations
  add column if not exists no_show_grace_minutes integer not null default 15;

alter table public.location_reservations drop constraint if exists location_reservations_no_show_grace_check;
alter table public.location_reservations add constraint location_reservations_no_show_grace_check check (no_show_grace_minutes between 0 and 180);

create or replace function public.apply_reservation_guarantee_snapshot()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_enabled boolean;
  v_cutoff integer;
  v_grace integer;
  v_late_type text;
  v_late_cents integer;
  v_no_show_type text;
  v_no_show_cents integer;
begin
  if coalesce(new.source, '') not in ('theouthaven','theouthaven_reschedule') then
    return new;
  end if;

  select
    reservation_guarantee_enabled,
    reservation_cancel_cutoff_hours,
    reservation_no_show_grace_minutes,
    reservation_late_cancel_fee_type,
    reservation_late_cancel_fee_cents,
    reservation_no_show_fee_type,
    reservation_no_show_fee_cents
  into
    v_enabled,
    v_cutoff,
    v_grace,
    v_late_type,
    v_late_cents,
    v_no_show_type,
    v_no_show_cents
  from public.locations
  where id = new.location_id;

  new.no_show_grace_minutes := coalesce(v_grace, 15);
  new.deposit_required := false;
  new.deposit_amount := 0;
  new.deposit_status := 'not_required';

  if coalesce(v_enabled, false) then
    new.guarantee_required := true;
    new.guarantee_status := case when coalesce(new.guarantee_status, 'not_required') = 'active' then 'active' else 'pending' end;
    new.guarantee_cancel_cutoff_hours := coalesce(v_cutoff, 6);
    new.guarantee_late_cancel_fee_type := coalesce(v_late_type, 'per_person');
    new.guarantee_late_cancel_fee_cents := coalesce(v_late_cents, 1000);
    new.guarantee_no_show_fee_type := coalesce(v_no_show_type, 'per_person');
    new.guarantee_no_show_fee_cents := coalesce(v_no_show_cents, 2000);
    if new.guarantee_status <> 'active' then
      new.status := 'pending';
    end if;
  else
    new.guarantee_required := false;
    new.guarantee_status := 'not_required';
  end if;

  return new;
end;
$function$;
