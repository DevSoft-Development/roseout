# TheOutHaven Website V3

Website V3 is a clean-room hosted-site design engine built in parallel with the current website renderer.

## Non-negotiable rules

1. Do not import or extend the legacy static renderer, premium theme artifact, expanded design artifact, agency template system, composition profiles, or bespoke premium renderer.
2. V3 may consume canonical business/location data, menu data, reservations, reviews, events/experiences, domains, SEO inputs, and publish contracts.
3. Each premium concept owns its own DOM tree and its own CSS. Concepts do not share page section markup.
4. Shared code is limited to low-level safe primitives: escaping, document metadata, URLs, canonical data adapters, and publish file helpers.
5. A new concept is not accepted because it has a different palette. It must differ in information hierarchy, hero architecture, navigation, image choreography, section sequence, conversion placement, content density, and responsive behavior.
6. Build a small number of exceptional concepts first. Do not recreate 40 variants until the flagship concepts pass visual QA.
7. Preserve owner content and live business-data synchronization. Presentation may change; canonical business facts do not duplicate.
8. Existing production website rendering remains available until V3 is explicitly promoted.

## Initial flagship concepts

### Nocturne
For steakhouses, lounges, nightlife, jazz, rooftop evenings, and upscale dining.
- cinematic full-bleed photography
- restrained dark navigation
- reservation-forward conversion
- large editorial type
- immersive gallery transitions
- menu treated as a curated tasting/editorial feature

### Atelier
For chef-driven dining, sushi, wine, museums, galleries, and design-forward venues.
- asymmetric editorial grid
- typographic storytelling
- generous whitespace
- art-book image composition
- low-chrome navigation
- menu/story woven together rather than stacked as cards

### Vista
For rooftops, coastal venues, gardens, breweries, destinations, and visually led spaces.
- panoramic hero
- location/view-first storytelling
- horizontal visual rhythm
- large environmental photography
- visit information integrated into the narrative

### Social House
For brunch, karaoke, bowling, arcade, family entertainment, mini golf, and group experiences.
- energetic multi-image composition
- events/experiences surfaced early
- bold booking hierarchy
- social proof integrated into the page rather than a generic review grid
- playful but polished motion and typography

### Quiet Luxury
For spas, wellness, intimate restaurants, private dining, and premium minimal brands.
- calm pacing
- minimal navigation
- tactile typography
- restrained image count
- whitespace as a design element
- discreet reservation treatment

## Quality gate

Before V3 gains more concepts, the first five must be reviewed at desktop, tablet, and mobile using real TheOutHaven location data. A concept must look like it could reasonably be sold as a custom $5k-$10k hospitality website before it is considered complete.

## Rollout

1. Build isolated V3 data adapter and document helpers.
2. Build Nocturne end-to-end.
3. Build Atelier end-to-end.
4. Build Vista end-to-end.
5. Build Social House end-to-end.
6. Build Quiet Luxury end-to-end.
7. Add V3 preview-only selector in Website dashboard.
8. Perform real visual QA using multiple locations and device sizes.
9. Only after approval, connect V3 to publish flow.
10. Expand the concept catalog based on proven quality, not arbitrary template count.
