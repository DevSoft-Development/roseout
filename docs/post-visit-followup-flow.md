# Post-visit follow-up flow

## Planned outings
- Dated outings are evaluated hourly.
- Follow-up is due the next morning at 10:00 AM in the outing timezone.
- SMS uses TheOutHaven Concierge (0411) when SMS consent/contact exists.
- Email uses the branded email sender when an email is available.
- The branded `outhvn.com` link opens attendance confirmation.
- If the guest confirms they went, they continue to a verified review.
- If they did not go, no review is requested.

## Internal TheOutHaven Reserve reservations
- `seated` or `completed` is treated as verified attendance.
- `checked_in`/`waiting` alone is not treated as verified attendance.
- The next-morning follow-up skips the attendance question and opens the verified review directly.
- Existing reservation SMS consent is respected because the booking flow only stores the phone number when SMS consent is checked.

## Review experience
- The page shows the verified location visited.
- Guests rate/review the location.
- Guests separately rate TheOutHaven planning/booking and can leave platform feedback.
- Location reviews remain in the existing moderation and review-intelligence workflow.
- TheOutHaven experience feedback is stored in the eligibility metadata tied to the verified visit.

## Safety against accidental sends
- Only follow-ups due within the last 36 hours are eligible.
- Old historical visits are not back-messaged.
- Reservation eligibility metadata records follow-up delivery to prevent duplicates.
- Outings continue to use `next_morning_followup_sent_at` for deduplication.
