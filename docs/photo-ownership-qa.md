# Photo Ownership QA Scenarios

1. Unclaimed/claimed location with Google Place ID and zero owner photos: public profile gets up to five indexed Google slots.
2. One through four owner photos: owner photos stay first and Google fills only the remaining public mosaic positions.
3. Five owner photos: public mosaic contains no Google slots.
4. Owner selects a cover: it becomes the public primary image and remains protected from later Google enrichment.
5. Google has fewer than five usable photos: unavailable indexed slots fall back safely instead of being persisted.
6. Claimed business below three photos: photo setup shows progress and reminder lifecycle remains active.
7. Claimed business reaches three photos: pending photo reminders and CRM photo follow-up are stopped.
8. Google photo responses show available attribution and use no-store media delivery.
9. Monthly Google photo request cap reached: branded fallback is returned rather than issuing another media request.
10. Known legacy Google snapshots stored by older importers are bypassed by the public-profile photo wrapper when provenance is explicitly Google.
