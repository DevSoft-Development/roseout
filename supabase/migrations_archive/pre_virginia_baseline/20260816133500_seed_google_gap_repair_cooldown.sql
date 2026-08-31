update public.locations
set gap_repair_google_next_attempt_at = now() + interval '90 days'
where deleted_at is null
  and coalesce(is_demo, false) = false
  and gap_repair_google_calls > 0
  and gap_repair_google_next_attempt_at is null
  and (
    operating_hours is null
    or website is null
    or btrim(coalesce(website, '')) = ''
    or phone is null
    or btrim(coalesce(phone, '')) = ''
  );
