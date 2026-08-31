alter table public.sms_review_conversations
  drop constraint if exists sms_review_conversations_stage_check;

alter table public.sms_review_conversations
  add constraint sms_review_conversations_stage_check
  check (stage in (
    'review_consent',
    'attendance',
    'location_rating',
    'location_text',
    'platform_rating',
    'platform_text',
    'complete'
  ));
