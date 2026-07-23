export type PublicLocationDomain = "restaurant" | "activity" | "nightlife" | "experience" | "other";

export type PublicLocationRecord = Record<string, unknown>;

const GENERIC = new Set(["", "unknown", "venue", "business", "establishment", "point of interest", "point_of_interest", "place", "premise"]);
const UNSUPPORTED = /\b(store|retail|shop|mall|doctor|dentist|medical|hospital|clinic|lawyer|attorney|accountant|real estate|apartment|residential|church|mosque|synagogue|temple|car repair|auto|gas station|parking|bank|atm|school|university|pharmacy)\b/i;

function norm(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[_-]/g, " ").replace(/[^a-z0-9\s&]/g, " ").replace(/\s+/g, " ").trim();
}

function arr(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(arr);
  if (typeof value === "string") return value.split(",").map((x) => x.trim()).filter(Boolean);
  return value == null ? [] : [String(value)];
}

function title(value: string) {
  return value.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bNyc\b/g, "NYC");
}

export function publicClassificationExclusionReason(location: PublicLocationRecord): string | null {
  if (location.is_hidden === true) return "Hidden locations are excluded from public discovery.";
  if (location.is_searchable === false) return "Location is marked not searchable.";
  if (location.publish_ready === false) return "Location is not publish-ready.";
  if (location.unsupported_location_type === true) return "Location has an unsupported public type.";
  if (["hidden", "low_level"].includes(norm(location.visibility_tier ?? location.public_visibility_tier))) return "Visibility tier excludes public discovery.";
  if (norm(location.quality_status) && !["publish ready", "publish_ready", "approved", "clean"].includes(norm(location.quality_status))) return "Quality status is not public-ready.";
  const hay = classificationText(location);
  if (UNSUPPORTED.test(hay)) return "Retail, medical, professional service, residential, religious, automotive, and similar records are excluded.";
  return null;
}

export function classifyPublicLocation(location: PublicLocationRecord) {
  const hay = classificationText(location);
  const reason = publicClassificationExclusionReason(location);
  let domain: PublicLocationDomain = "other";
  let primary = "Curated place";

  if (/\b(hookah|nightclub|dance club|club|karaoke bar|lounge|rooftop bar|bar|cocktail|speakeasy|jazz|live music)\b/.test(hay)) {
    domain = "nightlife"; primary = pick(hay, [["Hookah lounge", /hookah/], ["Rooftop bar", /rooftop/], ["Nightclub", /nightclub|dance club/], ["Karaoke", /karaoke/], ["Live music", /live music|jazz/], ["Lounge", /lounge/], ["Bar", /bar|cocktail/]]) || "Nightlife";
  }
  if (/\b(restaurant|dinner|lunch|brunch|cuisine|seafood|steak|sushi|italian|mexican|halal|chicken|french|cafe|bakery|food)\b/.test(hay) || location.restaurant_name) {
    domain = "restaurant"; primary = cleanLabel(location.cuisine ?? location.cuisine_type ?? location.food_type ?? location.primary_category) || "Restaurant";
  }
  if (/\b(museum|gallery|bowling|arcade|escape room|movie theater|cinema|spa|park|mini golf|golf|comedy|theater|paint and sip|activity)\b/.test(hay) || location.activity_name) {
    domain = /\b(event space|experience|tour|class|paint and sip)\b/.test(hay) ? "experience" : "activity";
    primary = pick(hay, [["Escape room", /escape room/], ["Bowling", /bowling/], ["Arcade", /arcade/], ["Karaoke", /karaoke/], ["Movie theater", /movie theater|cinema/], ["Museum", /museum/], ["Gallery", /gallery/], ["Spa", /spa/], ["Park", /park/], ["Mini golf", /mini golf|putt/], ["Golf", /golf/], ["Comedy", /comedy/], ["Theater", /theater/], ["Live music", /live music/]]) || cleanLabel(location.activity_type ?? location.primary_category) || "Activity";
  }

  const labels = getPublicLocationLabels(location, primary, domain);
  return { domain, primaryLabel: labels.primaryLabel, secondaryLabels: labels.secondaryLabels, isPubliclyDiscoverable: !reason && domain !== "other", exclusionReason: reason };
}

export function getPublicLocationCategory(location: PublicLocationRecord) { return classifyPublicLocation(location).primaryLabel; }

export function getPublicLocationLabels(location: PublicLocationRecord, primary = cleanLabel(location.primary_category) || "Curated place", domain?: PublicLocationDomain) {
  const seen = new Set<string>();
  const candidates = [primary, location.cuisine, location.cuisine_type, location.activity_type, location.primary_tag, ...arr(location.best_for_tags), ...arr(location.vibe_tags), ...arr(location.tags)]
    .map(cleanLabel)
    .filter((x): x is string => Boolean(x) && !GENERIC.has(norm(x)));
  const unique = candidates.filter((x) => { const k = norm(x); if (seen.has(k)) return false; seen.add(k); return true; });
  return { primaryLabel: unique[0] || title(domain || "Curated place"), secondaryLabels: unique.slice(1, 4) };
}

function cleanLabel(value: unknown) { const n = norm(value); return !n || GENERIC.has(n) ? "" : title(n); }
function classificationText(l: PublicLocationRecord) { return ["type","location_type","primary_category","category","primary_tag","cuisine","cuisine_type","food_type","activity_type","search_document", "search_keywords", "google_types", "tags", "vibes", "vibe_tags", "best_for_tags"].flatMap((k) => arr(l[k])).map(norm).join(" "); }
function pick(hay: string, rules: [string, RegExp][]) { return rules.find(([, re]) => re.test(hay))?.[0] || ""; }
