import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const weeklyPage = read('app/user/dashboard/beta/weekly/page.tsx');
const guidedRoute = read('app/api/beta/guided/route.ts');
const reminderEmails = read('lib/beta/reminderEmails.ts');
const betaCommandCenter = read('components/user/beta/BetaCommandCenter.tsx');
const eligibility = read('lib/beta-giveaway-eligibility.ts');
const vercel = JSON.parse(read('vercel.json'));

function assertIncludes(haystack, needle, message) {
  assert.ok(haystack.includes(needle), message || `Expected to find ${needle}`);
}

assertIncludes(weeklyPage, 'getWeeklyBetaEnabled', 'weekly route must check real weekly flag');
assertIncludes(weeklyPage, 'if (!weeklyBetaEnabled)', 'weekly route must block real sessions while disabled');
assertIncludes(weeklyPage, 'Weekly beta task is not open yet', 'weekly disabled state must be user-friendly');
assert.ok(weeklyPage.indexOf('if (!weeklyBetaEnabled)') < weeklyPage.indexOf('getOrCreateWeeklyBetaSessionForTester(ctx.beta.id)'), 'weekly route must not create/fetch real sessions before disabled guard');

assertIncludes(weeklyPage, 'getWeeklyBetaE2ETestModeEnabled', 'test route must check e2e flag');
assertIncludes(weeklyPage, 'if (!weeklyBetaTestModeEnabled)', 'test route must block ?test=1 while disabled');
assert.ok(weeklyPage.indexOf('if (!weeklyBetaTestModeEnabled)') < weeklyPage.indexOf('getOrCreateWeeklyBetaSessionForUser(ctx.user.id, true)'), 'test route must not create test sessions before test-mode guard');
assertIncludes(weeklyPage, 'Enable test mode from the admin beta or giveaway controls', 'admins need helpful test-mode disabled message');

assertIncludes(guidedRoute, 'completedStepsFor', 'guided route must update session completed steps');
assertIncludes(guidedRoute, 'syncTesterProgressFromSession(session)', 'guided route must sync real session progress');
assertIncludes(guidedRoute, 'shouldSyncTesterProgress', 'guided route must centralize sync guard');
assertIncludes(guidedRoute, '!session?.test_mode', 'test-mode progress must not sync beta_testers');
assertIncludes(guidedRoute, 'cappedWeeklyCompletedSteps(', 'real progress must use completed_steps capped at 5');
assertIncludes(guidedRoute, 'sendBetaReminderEmail({', 'completion email must be queued once for real completed sessions');
assertIncludes(guidedRoute, 'reminderType: "completed_weekly_goal"', 'completion email must use completed weekly goal reminder type');
assertIncludes(guidedRoute, 'WEEKLY_BETA_COMPLETION_EMAIL_ERROR', 'completion email failures must be logged without blocking completion');
assertIncludes(guidedRoute, '.eq("reminder_type", "completed_weekly_goal")', 'completion email dedupe must check reminder type');

for (const allowed of ['weekly_tasks','midweek_reminder','daily_incomplete_reminder','friday_final_reminder','completed_weekly_goal']) {
  assertIncludes(reminderEmails, `"${allowed}"`, `reminder emails must support canonical type ${allowed}`);
}
for (const unsafe of ['reminder_type: "weekly_start"','reminder_type: "midweek_nudge"','reminder_type: "daily_incomplete"','reminder_type: "friday_final"']) {
  assert.ok(!reminderEmails.includes(unsafe), `reminder inserts must not use legacy internal value ${unsafe}`);
}
assertIncludes(reminderEmails, 'weekly_start: "weekly_tasks"', 'legacy weekly_start input should map to DB-safe type');
assertIncludes(reminderEmails, 'Your weekly TheOutHaven beta task is complete', 'completion email subject must use requested copy');
assertIncludes(reminderEmails, 'Look out for next week’s task', 'completion email must tell testers to look out for next week');
assertIncludes(reminderEmails, '${input.completed} of ${input.required} steps complete', 'completion email must display weekly progress');

assertIncludes(betaCommandCenter, 'Nothing was off', 'feedback dropdown must include Nothing was off option');
assertIncludes(betaCommandCenter, 'nothing_was_off', 'feedback dropdown must save clean Nothing was off value');
assertIncludes(betaCommandCenter, 'Select an option', 'feedback dropdown must keep empty placeholder');
assertIncludes(betaCommandCenter, 'completionNotice', 'completion success must render near the check-in button');
assert.ok(betaCommandCenter.indexOf('Finish weekly check-in') < betaCommandCenter.lastIndexOf('completionNotice'), 'completion success should render below the check-in button');

assertIncludes(eligibility, '.eq("test_mode", false)', 'giveaway eligibility must ignore test sessions');

assert.ok(vercel.crons.some((cron) => cron.path === '/api/cron/beta-reminders' && cron.schedule === '0 14 * * 1-5'), 'vercel cron must schedule beta reminders on weekdays around 14:00 UTC');

console.log('Beta production-readiness regression checks passed.');
