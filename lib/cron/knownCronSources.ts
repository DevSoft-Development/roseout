export type CronSourceKind = "nextjs_route" | "vercel_cron" | "edge_function" | "unknown";

export type KnownCronSource = {
  job_key: string;
  source: CronSourceKind;
  route_path: string;
  schedule_detected: boolean;
  schedule_hint: string | null;
  logger_expected: boolean;
  notes: string;
};

export const knownCronSources: KnownCronSource[] = [
  { job_key: "run-google-import", source: "vercel_cron", route_path: "/api/admin/run-google-import?type=both&limit=2&batch=all&areas=nyc&maxQueries=2", schedule_detected: true, schedule_hint: "Vercel cron: 0 3 * * *", logger_expected: true, notes: "Declared in vercel.json." },
  { job_key: "backfill-review-counts", source: "vercel_cron", route_path: "/api/admin/backfill-review-counts", schedule_detected: true, schedule_hint: "Vercel cron: 30 4 * * *", logger_expected: true, notes: "Declared in vercel.json." },
  { job_key: "semantic-nightly", source: "vercel_cron", route_path: "/api/admin/semantic-nightly", schedule_detected: true, schedule_hint: "Vercel cron: 0 3 * * *", logger_expected: true, notes: "Declared in vercel.json." },
  { job_key: "nightly-photo-backfill", source: "edge_function", route_path: "supabase/functions/nightly-photo-backfill", schedule_detected: true, schedule_hint: "pg_cron: 30 6 * * *; Vercel route also exists at /api/cron/nightly-photo-backfill (15 4 * * *)", logger_expected: true, notes: "Scheduled in supabase/sql/setup-edge-function-crons.sql and vercel.json." },
  { job_key: "health-intelligence", source: "vercel_cron", route_path: "/api/cron/health-intelligence", schedule_detected: true, schedule_hint: "Vercel cron: 30 3 * * *", logger_expected: true, notes: "Declared in vercel.json." },
  { job_key: "daily-admin-digest", source: "vercel_cron", route_path: "/api/cron/daily-admin-digest", schedule_detected: true, schedule_hint: "Vercel cron: 0 5 * * *", logger_expected: true, notes: "Declared in vercel.json." },
  { job_key: "ml-recalculate-phase2", source: "vercel_cron", route_path: "/api/admin/ml/recalculate-phase2", schedule_detected: true, schedule_hint: "Vercel cron: 30 8 * * *", logger_expected: true, notes: "Declared in vercel.json." },
  { job_key: "beta-tester-reminders", source: "edge_function", route_path: "supabase/functions/beta-tester-reminders", schedule_detected: true, schedule_hint: "pg_cron: 0 14 * * 1-5", logger_expected: true, notes: "Disabled/replaced by Next.js /api/cron/beta-reminders; unscheduled by migration." },
  { job_key: "admin-giveaway-review-reminder", source: "edge_function", route_path: "supabase/functions/admin-giveaway-review-reminder", schedule_detected: true, schedule_hint: "pg_cron schedule in 20260608130000_admin_giveaway_review_reminder_cron.sql", logger_expected: true, notes: "Scheduled by a versioned Supabase migration." },
  { job_key: "admin-search-health-digest", source: "edge_function", route_path: "supabase/functions/admin-search-health-digest", schedule_detected: true, schedule_hint: "pg_cron: 30 12 * * *", logger_expected: true, notes: "Scheduled in supabase/sql/setup-edge-function-crons.sql and supabase/search-health-digest-cron.sql." },
  { job_key: "admin-cron-digest-email", source: "edge_function", route_path: "supabase/functions/admin-cron-digest-email", schedule_detected: true, schedule_hint: "pg_cron: 0 12 * * *", logger_expected: true, notes: "Scheduled in supabase/sql/setup-edge-function-crons.sql." },
  { job_key: "nightly-demo-reset", source: "edge_function", route_path: "supabase/functions/nightly-demo-reset", schedule_detected: true, schedule_hint: "pg_cron: 15 8 * * *", logger_expected: true, notes: "Scheduled in supabase/sql/setup-edge-function-crons.sql; an older commented example also exists." },
  { job_key: "team-session-watchdog", source: "edge_function", route_path: "supabase/functions/team-session-watchdog", schedule_detected: true, schedule_hint: "pg_cron: */30 * * * *", logger_expected: true, notes: "Disabled/replaced by Next.js /api/cron/beta-reminders; unscheduled by migration." },
  { job_key: "reservation-daily-digest", source: "edge_function", route_path: "supabase/functions/reservation-daily-digest", schedule_detected: false, schedule_hint: "No repo schedule found", logger_expected: false, notes: "Function exists, but only placeholder code was found and no scheduler declaration was found." },
  { job_key: "reservation-status-cleanup", source: "edge_function", route_path: "supabase/functions/reservation-status-cleanup", schedule_detected: false, schedule_hint: "No repo schedule found", logger_expected: false, notes: "Function exists, but only placeholder code was found and no scheduler declaration was found." },
  { job_key: "reservation-reminder-cron", source: "edge_function", route_path: "supabase/functions/reservation-reminder-cron", schedule_detected: false, schedule_hint: "No repo schedule found", logger_expected: false, notes: "Function exists, but only placeholder code was found and no scheduler declaration was found." },
  { job_key: "outing-reminders", source: "edge_function", route_path: "supabase/functions/outing-reminders", schedule_detected: false, schedule_hint: "No repo schedule found", logger_expected: true, notes: "Cron-like protected Edge Function exists, but no scheduler declaration was found." },
  { job_key: "google-location-enrichment", source: "edge_function", route_path: "supabase/functions/google-location-enrichment", schedule_detected: false, schedule_hint: "No repo schedule found", logger_expected: true, notes: "Cron-secret-protected background Edge Function exists, but no scheduler declaration was found." },
];

export const knownCronSourceByKey = new Map(knownCronSources.map((source) => [source.job_key, source]));
