# Photo Ownership & Google Gallery Rollout

This rollout makes owner-controlled photos authoritative while using current Google Places photos only to fill missing public gallery positions.

## Public gallery rules

- 0 owner photos: up to 5 indexed Google photo slots.
- 1 owner photo: owner first + up to 4 Google slots.
- 2 owner photos: owner first + up to 3 Google slots.
- 3 owner photos: owner first + up to 2 Google slots.
- 4 owner photos: owner first + up to 1 Google slot.
- 5+ owner photos: no Google gallery slots are needed.

Google slots are stable TheOutHaven proxy URLs using `placeId + index`. The current Google photo resource name and attribution are resolved at request time and are not persisted by the new path.

## Claimed-location lifecycle

- Claim approval sends the owner to `/locations/dashboard/profile?setup=photos&claimed=1`.
- Three owner photos is the recommended minimum.
- Five owner photos completes the gallery.
- Day-3 and day-7 reminders reuse `profile_completion_nurture_queue`.
- Reminders and the CRM photo follow-up are cancelled once the owner reaches three photos.
- Owner photos set `profile_manual_lock` and are protected from Google hero-image overwrite at the database layer.

## Search quality

Photo completeness contributes only a small reversible component to the existing `search_boost`:

- 0 owner photos: +0
- 1-2 owner photos: +1
- 3-4 owner photos: +2
- 5+ owner photos: +3

This is intentionally too small to overpower intent, geography, hours, cuisine/category, or review relevance.

## Google cost controls

- Google Place photo media responses use `no-store`.
- Photo metadata is fetched with the `photos` field only.
- `GOOGLE_PHOTO_MONTHLY_REQUEST_CAP` defaults to 15,000 successful media attempts/month.
- When the cap is reached, the proxy serves the branded fallback instead of making another Google media request.
- Google attribution is surfaced through `SafeLocationImage`.

## Legacy Google snapshots

The database contains historical Google-derived images that were copied into the `location-images` bucket by older importers. For rows explicitly marked with a Google `photo_source`, the public profile path now ignores those legacy `google-*`, `migrated-google-*`, and similar snapshots and uses current indexed Google slots instead.

Do not bulk-delete historical storage objects in this rollout. Some older rows have unclear provenance and should be classified before destructive cleanup.

## Activation order

1. Deploy application code that understands the new photo reminder message types.
2. Verify the preview/build and public gallery behavior.
3. Merge/deploy the application.
4. Apply `20260827220500_backfill_claimed_photo_nudges.sql` to seed day-3/day-7 photo nudges for businesses claimed before this rollout.

The first three schema migrations are backward-compatible and can exist before the app deploy. The claimed-location reminder backfill should not run until the new nurture worker is live.
