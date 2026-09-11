# Native location E2E QA

Use this checklist on the fresh Android Preview build after this branch is merged.

- Step 1 matches the web create flow wording and progression.
- Step 2 shows Back + TheOutHaven branding + Home at the top.
- Explicit parsed location wins over device location (example: `Date night in Brooklyn`).
- Manual location wins after editing an explicit location.
- `Use my location` requests foreground location permission only after the user taps it.
- Granted permission changes the control to `✓ My location` and sends device coordinates into canonical search.
- Denied permission leaves manual neighborhood/city/ZIP entry available and shows a customer-friendly message.
- Step 2 timing and preference copy matches web, including `Anytime`, `Exact date & time`, and `Show My Picks →`.
- Step 3 matches web copy, loading, strongest-first results, `WHY YOU’LL LIKE IT`, and Build your own outing.
- Location detail has a visible top Back control plus TheOutHaven brand/Home controls.
- Step 4 uses `Finish your outing.` and preserves Back to picks, save, share, and venue navigation.
- Restaurant-only, activity-only, mixed outing, and same-venue searches complete successfully.
- Deep links and push registration/reminders still work.
