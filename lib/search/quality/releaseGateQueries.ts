const AREAS = ["Brooklyn", "Queens", "Astoria", "Williamsburg", "Forest Hills", "Garden City"] as const;

const TEMPLATES = [
  "date night in {area}",
  "romantic upscale date night in {area}",
  "rooftop dinner in {area}",
  "girls night with drinks in {area}",
  "family outing in {area}",
  "birthday dinner and something fun in {area}",
  "quiet business dinner in {area}",
  "brunch in {area}",
  "sushi restaurant in {area}",
  "halal restaurant in {area}",
  "seafood rooftop restaurant in {area}",
  "casual chicken lunch in {area}",
  "sports bar with wings in {area}",
  "bowling in {area}",
  "karaoke in {area}",
  "museum in {area}",
  "escape room in {area}",
  "mini golf in {area}",
  "restaurant with hookah in {area}",
  "dinner then hookah in {area}",
  "dinner then bowling in {area}",
  "Italian dinner and an activity within walking distance in {area}",
  "quiet cocktails and something relaxing in {area}",
  "affordable date night in {area}",
  "dinner and an activity in {area} but no bowling",
  "restaurant in {area} without hookah",
  "family outing in {area} no nightclub",
  "dinner and an activity in {area} tonight at 9:30 PM",
  "date night in {area} Friday at 8:00 PM",
  "dinner then hookah in {area} Saturday at 9:00 PM",
  "live music after dinner in {area}",
  "something fun to do in {area}",
] as const;

export const SEARCH_RELEASE_GATE_QUERIES = AREAS.flatMap((area) =>
  TEMPLATES.map((template) => template.replace("{area}", area)),
);

export const SEARCH_RELEASE_GATE_BATCHES = Array.from(
  { length: Math.ceil(SEARCH_RELEASE_GATE_QUERIES.length / 50) },
  (_, index) => SEARCH_RELEASE_GATE_QUERIES.slice(index * 50, (index + 1) * 50),
);