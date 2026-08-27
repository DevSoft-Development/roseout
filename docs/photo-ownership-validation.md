# Photo Ownership Validation

- [x] Existing upload permission layer reused.
- [x] Owner uploads are tracked separately from admin/demo uploads.
- [x] Owner-selected cover photo wins over Google fallback.
- [x] Database guard prevents later Google enrichment from reclaiming owner hero.
- [x] Public helper creates five distinct `placeId + index` Google slots.
- [x] Five owner photos eliminate Google gallery fill.
- [x] Google media proxy uses `no-store`.
- [x] Google attribution metadata is resolved live and displayed through `SafeLocationImage`.
- [x] Monthly Google media request cap is configurable.
- [x] Known legacy persisted Google snapshots are bypassed on the public profile path.
- [x] Claim approval points owners to photo setup.
- [x] Day-3/day-7 reminders reuse the existing nurture queue.
- [x] CRM follow-up is cancelled when the recommended three-photo minimum is met.
- [x] Photo completion search boost is capped at +3.
- [x] Admin photo-health endpoint reports claimed locations by owner-photo count.
- [x] Existing claimed-location nudge backfill is staged for activation only after the new nurture worker is live.
