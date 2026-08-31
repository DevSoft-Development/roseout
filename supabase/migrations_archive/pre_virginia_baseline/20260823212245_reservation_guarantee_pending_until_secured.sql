create or replace function public.apply_reservation_guarantee_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_enabled boolean;
  v_cutoff integer;
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
    reservation_late_cancel_fee_type,
    reservation_late_cancel_fee_cents,
    reservation_no_show_fee_type,
    reservation_no_show_fee_cents
  into
    v_enabled,
    v_cutoff,
    v_late_type,
    v_late_cents,
    v_no_show_type,
    v_no_show_cents
  from public.locations
  where id = new.location_id;

  new.deposit_required := false;
  new.deposit_amount := 0;
  new.deposit_status := 'not_required';

  if coalesce(v_enabled, false) then
    new.guarantee_required := true;
    new.guarantee_status := case when coalesce(new.guarantee_status, 'not_required') = 'active' then 'active' else 'pending' end;
    new.guarantee_cancel_cutoff_hours := coalesce(v_cutoff, 6);
    new.guarantee_late_cancel_fee_type := coalesce(v_late_type, 'flat');
    new.guarantee_late_cancel_fee_cents := coalesce(v_late_cents, 0);
    new.guarantee_no_show_fee_type := coalesce(v_no_show_type, 'flat');
    new.guarantee_no_show_fee_cents := coalesce(v_no_show_cents, 0);
    if new.guarantee_status <> 'active' then
      new.status := 'pending';
    end if;
  else
    new.guarantee_required := false;
    new.guarantee_status := 'not_required';
  end if;

  return new;
end;
$$;
