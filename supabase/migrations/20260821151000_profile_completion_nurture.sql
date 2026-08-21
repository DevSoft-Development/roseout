create table if not exists public.profile_completion_nurture_queue (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  claim_request_id uuid references public.location_claim_requests(id) on delete set null,
  message_type text not null check (message_type in ('completion_confirmation','upgrade_intro')),
  contact_channel text check (contact_channel in ('email','sms')),
  contact text,
  status text not null default 'pending' check (status in ('pending','processing','sent','needs_consent','skipped','failed')),
  due_at timestamptz not null,
  sent_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, message_type)
);

create index if not exists profile_completion_nurture_due_idx
  on public.profile_completion_nurture_queue (status, due_at)
  where status in ('pending','needs_consent','failed');

alter table public.profile_completion_nurture_queue enable row level security;
revoke all on table public.profile_completion_nurture_queue from anon, authenticated;

create or replace function public.claim_profile_strength(p_location public.locations)
returns integer
language sql
immutable
set search_path = public
as $$
  select round((
    (
      case when (p_location.operating_hours is not null and p_location.operating_hours <> '{}'::jsonb)
             or nullif(btrim(coalesce(p_location.hours,'')), '') is not null then 1 else 0 end +
      case when nullif(btrim(coalesce(p_location.main_image,p_location.image_url,p_location.storage_photo_url,p_location.google_photo_url,'')), '') is not null then 1 else 0 end +
      case when nullif(btrim(coalesce(p_location.reservation_url,p_location.external_reservation_url,p_location.booking_url,p_location.reservation_link,p_location.reservation_platform_url,'')), '') is not null then 1 else 0 end +
      case when nullif(btrim(coalesce(p_location.menu_url,'')), '') is not null then 1 else 0 end +
      case when nullif(btrim(coalesce(p_location.website,p_location.website_url,'')), '') is not null then 1 else 0 end +
      case when nullif(btrim(coalesce(p_location.phone,'')), '') is not null then 1 else 0 end
    )::numeric / 6::numeric
  ) * 100)::integer;
$$;

revoke all on function public.claim_profile_strength(public.locations) from public, anon, authenticated;

create or replace function public.enqueue_profile_completion_nurture()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_strength integer;
  v_prior_strength integer;
  v_claim public.location_claim_requests%rowtype;
  v_channel text;
  v_contact text;
  v_name text;
  v_angle text;
begin
  if new.profile_last_owner_update_at is null then
    return new;
  end if;

  if not (coalesce(new.is_claimed,false) or new.owner_user_id is not null or new.claim_status = 'approved') then
    return new;
  end if;

  v_strength := public.claim_profile_strength(new);
  v_prior_strength := public.claim_profile_strength(old);

  if v_strength <> 100 or v_prior_strength = 100 then
    return new;
  end if;

  select * into v_claim
  from public.location_claim_requests
  where location_id = new.id
    and status in ('approved','pending','needs_more_info')
  order by (status = 'approved') desc, coalesce(reviewed_at, submitted_at, created_at) desc
  limit 1;

  v_channel := coalesce(v_claim.verified_contact_channel,
    case when nullif(btrim(coalesce(new.owner_email,'')), '') is not null then 'email'
         when nullif(btrim(coalesce(new.owner_phone,'')), '') is not null then 'sms'
         else null end);
  v_contact := coalesce(v_claim.verified_contact,
    case when v_channel = 'email' then new.owner_email
         when v_channel = 'sms' then new.owner_phone
         else null end);
  v_name := coalesce(nullif(new.name,''), nullif(new.restaurant_name,''), nullif(new.activity_name,''), 'Your business');

  v_angle := case
    when not coalesce(new.uses_internal_reservations,false)
      and nullif(btrim(coalesce(new.reservation_url,new.external_reservation_url,new.booking_url,new.reservation_link,new.reservation_platform_url,'')), '') is not null
      then 'reservations'
    when coalesce(new.location_type,new.type,'') ilike '%activ%' then 'events_experiences'
    else 'growth_tools'
  end;

  if not exists (
    select 1 from public.claim_funnel_events
    where location_id = new.id and event_type = 'profile_completed'
  ) then
    insert into public.claim_funnel_events(location_id, claim_code, event_type, metadata)
    values (new.id, v_claim.claim_code, 'profile_completed', jsonb_build_object(
      'profile_strength', 100,
      'recommended_angle', v_angle,
      'source', 'owner_profile_update'
    ));
  end if;

  insert into public.profile_completion_nurture_queue(
    location_id, claim_request_id, message_type, contact_channel, contact, status, due_at, metadata
  ) values (
    new.id, v_claim.id, 'completion_confirmation', v_channel, v_contact,
    case when v_contact is null or v_channel is null then 'skipped' else 'pending' end,
    now(), jsonb_build_object('profile_strength',100,'business_name',v_name,'recommended_angle',v_angle)
  ) on conflict (location_id, message_type) do nothing;

  insert into public.profile_completion_nurture_queue(
    location_id, claim_request_id, message_type, contact_channel, contact, status, due_at, metadata
  ) values (
    new.id, v_claim.id, 'upgrade_intro', v_channel, v_contact,
    case when v_contact is null or v_channel is null then 'skipped' else 'pending' end,
    now() + interval '2 days', jsonb_build_object('profile_strength',100,'business_name',v_name,'recommended_angle',v_angle)
  ) on conflict (location_id, message_type) do nothing;

  if not exists (
    select 1 from public.crm_tasks
    where location_id = new.id
      and source = 'profile_completion_nurture'
      and source_record_id = new.id::text
      and archived_at is null
  ) then
    insert into public.crm_tasks(
      location_id, title, description, task_type, status, priority,
      assigned_team, due_at, reminder_at, source, source_record_id,
      queue_key, category, subtype, workflow_key, workflow_stage,
      assignment_reason, metadata
    ) values (
      new.id,
      'Follow up - profile completed: ' || v_name,
      'This claimed business reached 100% profile strength. Introduce the most relevant TheOutHaven paid capability after the completion confirmation has landed.',
      'follow_up','open','normal','sales',
      now() + interval '2 days', now() + interval '2 days',
      'profile_completion_nurture', new.id::text,
      'sales','growth','profile_completion','claimed_business_activation','profile_complete',
      'Claimed business reached 100% profile strength',
      jsonb_build_object('profile_strength',100,'recommended_angle',v_angle,'claim_request_id',v_claim.id,'verified_channel',v_channel)
    );
  end if;

  update public.locations
  set next_action = 'Introduce TheOutHaven paid tools after profile completion',
      next_action_type = 'sales_follow_up',
      next_action_due_at = now() + interval '2 days'
  where id = new.id;

  return new;
end;
$$;

revoke all on function public.enqueue_profile_completion_nurture() from public, anon, authenticated;

drop trigger if exists trg_enqueue_profile_completion_nurture on public.locations;
create trigger trg_enqueue_profile_completion_nurture
after update of profile_last_owner_update_at, operating_hours, hours, main_image, image_url, storage_photo_url, google_photo_url, reservation_url, external_reservation_url, booking_url, reservation_link, reservation_platform_url, menu_url, website, website_url, phone
on public.locations
for each row
execute function public.enqueue_profile_completion_nurture();
