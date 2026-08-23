alter table public.career_interviews
  add column if not exists interview_guide jsonb not null default '[]'::jsonb,
  add column if not exists interview_answers jsonb not null default '[]'::jsonb,
  add column if not exists interview_live_notes text,
  add column if not exists interview_guide_generated_at timestamptz;

comment on column public.career_interviews.interview_guide is 'Structured role-specific interview questions generated from the job requirements. Never use protected traits or prohibited hiring criteria.';
comment on column public.career_interviews.interview_answers is 'Interviewer-entered answers/evidence mapped to the structured interview guide.';
comment on column public.career_interviews.interview_live_notes is 'General job-related notes captured during the interview.';
