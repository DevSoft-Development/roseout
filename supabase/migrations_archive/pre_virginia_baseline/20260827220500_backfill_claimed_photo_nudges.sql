-- Seed the new photo-completion lifecycle for already claimed businesses.
-- The claim trigger handles future claims; this migration covers claims that were
-- approved before the photo ownership rollout was introduced.

with eligible as (
  select
    l.id as location_id,
    l.claimed_at,
    l.owner_email,
    l.owner_phone,
    l.owner_photo_count,
    coalesce(nullif(l.name,''), nullif(l.restaurant_name,''), nullif(l.activity_name,''), 'Your business') as business_name,
    c.id as claim_request_id,
    c.claim_code,
    coalesce(
      c.verified_contact_channel,
      case
        when nullif(btrim(coalesce(l.owner_email,'')), '') is not null then 'email'
        when nullif(btrim(coalesce(l.owner_phone,'')), '') is not null then 'sms'
        else null
      end
    ) as contact_channel,
    coalesce(
      c.verified_contact,
      case
        when coalesce(c.verified_contact_channel, case when nullif(btrim(coalesce(l.owner_email,'')), '') is not null then 'email' when nullif(btrim(coalesce(l.owner_phone,'')), '') is not null then 'sms' end) = 'email' then l.owner_email
        when coalesce(c.verified_contact_channel, case when nullif(btrim(coalesce(l.owner_email,'')), '') is not null then 'email' when nullif(btrim(coalesce(l.owner_phone,'')), '') is not null then 'sms' end) = 'sms' then l.owner_phone
        else null
      end
    ) as contact
  from public.locations l
  left join lateral (
    select r.*
    from public.location_claim_requests r
    where r.location_id = l.id
    order by (r.status = 'approved') desc, coalesce(r.reviewed_at, r.submitted_at, r.created_at) desc
    limit 1
  ) c on true
  where (coalesce(l.is_claimed,false) or l.owner_user_id is not null or l.claim_status = 'approved')
    and coalesce(l.owner_photo_count,0) < 3
), seeded as (
  insert into public.profile_completion_nurture_queue(
    location_id, claim_request_id, message_type, contact_channel, contact, status, due_at, metadata
  )
  select
    e.location_id,
    e.claim_request_id,
    m.message_type,
    e.contact_channel,
    e.contact,
    case when e.contact is null or e.contact_channel is null then 'skipped' else 'pending' end,
    greatest(
      now() + case when m.message_type = 'photo_reminder_day3' then interval '6 hours' else interval '3 days' end,
      coalesce(e.claimed_at, now()) + case when m.message_type = 'photo_reminder_day3' then interval '3 days' else interval '7 days' end
    ),
    jsonb_build_object(
      'business_name', e.business_name,
      'recommended_photos', 5,
      'minimum_photos', 3,
      'source', 'photo_ownership_backfill'
    )
  from eligible e
  cross join (values ('photo_reminder_day3'::text), ('photo_reminder_day7'::text)) as m(message_type)
  on conflict (location_id, message_type) do nothing
  returning location_id
)
insert into public.crm_tasks(
  location_id, title, description, task_type, status, priority,
  due_at, reminder_at, source, source_record_id,
  queue_key, category, subtype, workflow_key, workflow_stage,
  assignment_reason, metadata
)
select
  e.location_id,
  'Photo follow-up: ' || e.business_name,
  'Claimed location has fewer than 3 owner photos. Offer help completing the gallery; do not pressure the owner.',
  'profile_review','open','low',
  now() + interval '8 days', now() + interval '8 days',
  'photo_completion_nudge', e.location_id::text,
  'onboarding','profile','photos','claimed_business_activation','photos_needed',
  'Claimed business has fewer than 3 owner-controlled photos',
  jsonb_build_object('owner_photo_count',coalesce(e.owner_photo_count,0),'recommended_photos',5,'minimum_photos',3,'source','photo_ownership_backfill')
from eligible e
where not exists (
  select 1 from public.crm_tasks t
  where t.location_id = e.location_id
    and t.source = 'photo_completion_nudge'
    and t.source_record_id = e.location_id::text
    and t.archived_at is null
);
