-- Tighten Reserve opportunity evidence so generic crawler notes and blocked URL paths
-- cannot be mistaken for proof that a restaurant takes reservations offline.

create or replace function public.score_reserve_opportunity()
returns trigger
language plpgsql
as $$
declare
  v_score integer := 0;
  v_text text;
  v_category text;
  v_external_url text;
  v_manual_signal boolean := false;
  v_private_dining boolean := false;
  v_quick_service boolean := false;
  v_upscale boolean := false;
  v_needs_verification boolean := false;
  v_evidence jsonb := '[]'::jsonb;
begin
  v_category := lower(coalesce(new.primary_category, new.category, ''));
  v_text := lower(concat_ws(' ',
    new.description,
    new.reservation_discovery_notes,
    new.primary_category,
    new.category,
    new.cuisine,
    array_to_string(new.tags, ' ')
  ));

  v_external_url := coalesce(
    nullif(trim(new.external_reservation_url), ''),
    nullif(trim(new.reservation_url), ''),
    nullif(trim(new.reservation_link), ''),
    nullif(trim(new.reservation_platform_url), ''),
    nullif(trim(new.reservation_provider_url), ''),
    nullif(trim(new.reservation_source_url), ''),
    nullif(trim(new.reservation_external_url), ''),
    nullif(trim(new.reservation_portal_url), '')
  );

  if lower(coalesce(new.location_type, '')) <> 'restaurant' then
    new.reservation_upgrade_opportunity := false;
    new.reservation_opportunity_score := 0;
    new.reservation_opportunity_tier := null;
    new.reservation_opportunity_classification := 'not_applicable';
    new.reservation_opportunity_evidence := jsonb_build_array('Not classified as a restaurant');
    new.reservation_opportunity_scored_at := now();
    return new;
  end if;

  if v_external_url is not null
     or coalesce(new.internal_reservations_enabled, false)
     or coalesce(new.uses_internal_reservations, false)
     or lower(coalesce(new.reservation_source, '')) in ('internal','both')
     or coalesce(new.reservation_manual_override, false) then
    new.reservation_upgrade_opportunity := false;
    new.reservation_opportunity_score := 0;
    new.reservation_opportunity_tier := null;
    new.reservation_opportunity_classification := case
      when v_external_url is not null then 'has_external_reservations'
      else 'already_reservation_enabled'
    end;
    new.reservation_opportunity_evidence := jsonb_build_array(
      case when v_external_url is not null then 'Existing reservation path detected' else 'Internal/manual reservation configuration already exists' end
    );
    new.reservation_opportunity_scored_at := now();
    new.reservation_upgrade_reason := null;
    return new;
  end if;

  v_score := 25;
  v_evidence := v_evidence || jsonb_build_array('Restaurant has no recognized online reservation provider');

  if nullif(trim(new.website), '') is not null then
    v_score := v_score + 15;
    v_evidence := v_evidence || jsonb_build_array('First-party website is available');
  end if;

  v_score := v_score + 20;
  v_evidence := v_evidence || jsonb_build_array('Online reservation gap confirmed');

  -- Offline reservation intent must include an explicit phone/call/manual-booking cue.
  -- Generic words like "reservations" or crawler paths such as "/reservations:403"
  -- are not sufficient evidence by themselves.
  v_manual_signal :=
    v_text ~ '(call|phone|telephone|by phone).{0,40}(reservation|reservations|reserve|book|booking)'
    or v_text ~ '(reservation|reservations|reserve|book|booking).{0,40}(call|phone|telephone|by phone)';

  v_private_dining := v_text ~ '(private dining|private events?|group dining|large parties|banquet)';
  v_needs_verification := new.reservation_discovery_status in ('blocked','failed');

  if v_manual_signal then
    v_score := v_score + 30;
    v_evidence := v_evidence || jsonb_build_array('Explicit phone/manual reservation signal detected');
  end if;

  if v_private_dining then
    v_score := v_score + 15;
    v_evidence := v_evidence || jsonb_build_array('Private dining or group-event signal detected');
  end if;

  v_upscale := v_category ~ '(steakhouse|french|seafood|italian|japanese|sushi|fine|rooftop|lounge|mediterranean)';
  if v_upscale then
    v_score := v_score + 10;
    v_evidence := v_evidence || jsonb_build_array('Category is commonly reservation-friendly');
  end if;

  v_quick_service := v_category ~ '(cafe|bakery|deli|pizza|pizzeria|hamburger|burger|fast|food truck|ice cream|dessert|coffee|takeout|take-out)';
  if v_quick_service then
    v_score := v_score - 40;
    v_evidence := v_evidence || jsonb_build_array('Quick-service/walk-in category reduces Reserve fit');
  end if;

  if coalesce(new.rating, 0) >= 4 then
    v_score := v_score + 5;
    v_evidence := v_evidence || jsonb_build_array('Strong customer rating');
  end if;

  if coalesce(new.review_count, 0) >= 100 then
    v_score := v_score + 5;
    v_evidence := v_evidence || jsonb_build_array('Established review volume');
  end if;

  if v_needs_verification then
    v_score := v_score - 20;
    v_evidence := v_evidence || jsonb_build_array('Reservation discovery was blocked or failed; verify before outreach');
  elsif new.reservation_discovery_status = 'no_website' then
    v_score := v_score - 20;
    v_evidence := v_evidence || jsonb_build_array('No usable website currently available');
  end if;

  v_score := greatest(0, least(100, v_score));

  -- A blocked/failed crawl should never become a high-confidence sales lead until
  -- the reservation path has been rechecked successfully.
  if v_needs_verification then
    v_score := least(v_score, 49);
  end if;

  new.reservation_opportunity_score := v_score;
  new.reservation_opportunity_tier := case
    when v_score >= 70 then 'high'
    when v_score >= 50 then 'medium'
    else 'low'
  end;
  new.reservation_opportunity_classification := case
    when v_needs_verification then 'needs_verification'
    when v_manual_signal then 'takes_reservations_offline'
    when v_quick_service and v_score < 50 then 'walk_in_likely'
    else 'no_online_reservations'
  end;
  new.reservation_opportunity_evidence := v_evidence;
  new.reservation_opportunity_scored_at := now();
  new.reservation_upgrade_opportunity := v_score >= 40;
  new.reservation_upgrade_detected_at := case
    when v_score >= 40 then coalesce(new.reservation_upgrade_detected_at, now())
    else new.reservation_upgrade_detected_at
  end;
  new.reservation_upgrade_reason := case
    when v_score >= 40 then format(
      'Reserve opportunity %s (%s/100): %s',
      upper(case when v_score >= 70 then 'high' when v_score >= 50 then 'medium' else 'low' end),
      v_score,
      replace(new.reservation_opportunity_classification, '_', ' ')
    )
    else null
  end;

  return new;
end;
$$;

-- Re-score the full current catalog through the existing trigger. No network calls.
update public.locations
set reservation_discovery_notes = reservation_discovery_notes
where deleted_at is null;
