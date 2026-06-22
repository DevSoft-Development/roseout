# TheOutHaven Beta Tester Program

The public launch form now represents one unified program: **TheOutHaven Beta Tester Program**. The internal giveaway fields remain for compatibility, but the user-facing reward is the **$100 Beta Tester Reward**.

## Signup flow
1. A visitor submits the homepage beta tester form with name, email, optional phone, usual going-out area, social handle/platform, self-reported social follow, self-reported tagged friends, 18+ confirmation, rules agreement, marketing consent, and Turnstile.
2. The API creates or updates `launch_waitlist_signups` and `beta_applications`.
3. Valid program applications are auto-approved, linked to a `beta_testers` row, linked to an auth user, and assigned weekly beta tasks.
4. Password setup is sent using the shared server-only invite helper.

## Auto-approval rules
Auto-approval requires a valid name/email, 18+ confirmation, reward rules agreement, Turnstile when enabled, social handle/platform, followed-social confirmation, tagged-friends confirmation, and no duplicate social conflict.

## Password setup email
Beta testers receive a create-password email that says they are approved for TheOutHaven's Beta Tester Program, links to `/auth/create-password?token=...`, and points them to `/user/dashboard/beta` after setup.

## Weekly task reminder schedule
The reminder cron remains protected by `CRON_SECRET`.

- Monday: `weekly_tasks`
- Wednesday: `midweek_reminder`
- Thursday: `daily_incomplete_reminder`
- Friday: `friday_final_reminder`
- Completed 5/5: `completed_weekly_goal`

Reminder sends are deduped by `beta_email_reminders` per tester, reminder type, and week.

## Prize qualification rules
Admins may mark a tester Prize Qualified only when the tester exists and is active, current weekly beta tasks are complete, email is verified, reward opt-in remains true, social handle/platform are present, social follow and tagged friends are admin verified, 18+ and reward rules are confirmed, the entry is not a duplicate, and the entry is not disqualified.

## Admin verification steps
1. Review Beta Prize Eligibility entries.
2. Verify Social Follow.
3. Verify Tagged Friends.
4. Confirm weekly beta task progress and email verification.
5. Mark Prize Qualified only after all eligibility checks pass.

## Manual repair steps
- Resend password setup invite from admin user tooling or beta tester repair actions.
- Create/link user and send password setup invite when `beta_testers.user_id` is missing.
- Reassign weekly tasks when an active beta tester has no current assignments.
- Refresh eligibility after social verification or task completion.

## Required environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` or `SITE_URL`
- `RESEND_API_KEY` / configured email provider variables
- `CRON_SECRET`
- `NEXT_PUBLIC_TURNSTILE_ENABLED`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
