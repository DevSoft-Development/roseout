# LI V2 acquisition photo and walking-route release gates (2026-10-15)

## Single-path architecture
- DataForSEO Maps Standard Queue: **discovery lead and Google identity only**. Never treat its search snippet, URL, or image as a licensed business profile.
- An official website provides independent name/address/operating-status evidence; Census/Geoapify independently validates the address.
- For each verified new Google Place ID, the existing Google Places New photo adapter may resolve **only slot 0** before staging. Store the Place ID and a stable local proxy URL, not a downloaded image/photo resource name. The actual media and author attribution remain Google-managed, refreshed at display time.
- Owner/explicitly licensed photos stay the permanent, cacheable default when available, with the existing grant/evidence gate.
- Public result cards use native image loading=lazy. The primary Google-photo attribution metadata is requested only when the card approaches the viewport. Gallery slots are not loaded as a search-results gallery.
- Continue using the Mapbox pedestrian matrix for two-location walkable pair searches. Do not substitute straight-line distances for route-verified walking times. A failure to verify a required walkable pair must fail closed.
- Check Google's Places no-cache/display-on-map restrictions and attribution before presenting Google Places media next to Mapbox visual maps. Routing alone does not license Places media.
- Google photo-media cap stays **15,000 monthly successful media attempts** by the existing API proxy; track Google Places metadata usage separately.

## Reusable photo sources
1. Owner-provided media with valid owner rights/evidence: store in TheOutHaven-controlled storage.
2. Per-image licensed/public-domain media from Wikimedia Commons: only after checking the individual license (e.g., CC BY/CC BY-SA attribution/share-alike) and accurate business identity. License conditions differ between photos.
3. Generic stock imagery is **not** proof of an actual storefront or specific business. Do not misrepresent stock images as location photos. Pexels also limits systematic collection; do not bulk harvest it for location records.
4. Google Places live photo-slot proxy: **display-only**, not granted a permanent-hosting license. Use only in a compliant Google Places display surface.

## Certification before paid spending
1. Production CI and LI V2 identity+financial gates green; deploy correct application SHA.
2. Confirm Google Place ID deduplication and independent website/address/closure safeguards.
3. Record real photos/provider metadata for 25–50 **new, unique, eligible** candidate locations, count Google metadata/media calls and failures; no automatic bulk download.
4. Ensure each published location is searchable in Search V3 and has a real, provider-verified cover photo. Run authenticated Search V3 replay; an empty/harness-only green check is **not** certification.
5. Validate walking-pair route results against pedestrian routing and enforce no straight-line fallback.
6. Reconcile actual DataForSEO charges and held reservations (including any queue uncertainty) and Google API costs. Confirm Standard Queue depth and price before enabling the approved limit.
7. Only then enable an explicit **$10 hard campaign cap**, spending/provider flags and alerting. Keep unclaimed profiles maintainable by TOH; owners maintain claimed profiles. Stop on budget exhaustion, uncertain task, quality drop or unresolved financial reconciliation.

## Current rollout
This change only adds the photo-slot fallback and cost-aware lazy display, preserving existing independent-source rights safeguards. It does **not** establish the real 25–50-location E2E or authorize a paid campaign.
