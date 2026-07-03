# Weekly Beta E2E Checklist

## A. Admin test-mode E2E

1. Go to `/admin/dashboard/giveaway` or `/admin/dashboard/beta`.
2. Turn on weekly beta test mode.
3. Create Test Weekly Session.
4. Open Test Weekly Task.
5. Complete `/user/dashboard/beta/weekly?test=1`.
6. Confirm no automatic real completion email sends.
7. Click Send Test Completion Email.
8. Confirm branded test completion email arrives.
9. Reset test session.
10. Delete test session.

## B. Real beta-user E2E

1. Confirm `RESEND_API_KEY` is set.
2. Turn on real weekly beta task.
3. Create real weekly sessions.
4. Log in as active beta tester.
5. Complete `/user/dashboard/beta/weekly`.
6. Confirm success message under button.
7. Confirm Journey Map shows 5/5 complete.
8. Confirm completion email arrives once.
9. Confirm `beta_email_reminders` has `completed_weekly_goal` with status `sent`.
10. Re-submit/reload and confirm no duplicate email sends.

## C. Database checks

- `beta_test_sessions.status = completed`
- `beta_test_sessions.completed_at` is not null
- `beta_test_sessions.completed_steps` includes:
  - `write_outing`
  - `review_results`
  - `choose_match`
  - `feedback`
  - `check_in`
- `test_mode=true` sessions do not affect giveaway eligibility
- Real completed sessions send `completed_weekly_goal` once
