export type PublicMatchReasonType =
  | "cuisine"
  | "activity"
  | "location"
  | "occasion"
  | "price"
  | "hours"
  | "distance"
  | "walking"
  | "feature"
  | "other";

export type PublicMatchReason = {
  type: PublicMatchReasonType;
  label: string;
  source: "search_evidence" | "pairing";
  confidence: "high" | "medium";
};

function cleanLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^matched\s+/i, "")
    .replace(/^requested\s+/i, "")
    .replace(/^exact\s+/i, "");
}

function titlePhrase(value: string) {
  const cleaned = cleanLabel(value);
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function classifyReason(reason: string): PublicMatchReasonType {
  const value = reason.toLowerCase();
  if (/walk|walking/.test(value)) return "walking";
  if (/distance|mile|nearby|close/.test(value)) return "distance";
  if (/cuisine|italian|japanese|korean|thai|mexican|seafood|steak|sushi|ramen|food|dish|menu/.test(value)) return "cuisine";
  if (/activity|bowling|karaoke|museum|jazz|music|comedy|arcade|escape|golf|cinema|spa/.test(value)) return "activity";
  if (/borough|city|neighborhood|market|locality|area|geo/.test(value)) return "location";
  if (/date night|birthday|girls night|occasion|romantic|casual|relaxed/.test(value)) return "occasion";
  if (/price|budget|affordable|cheap|expensive/.test(value)) return "price";
  if (/hour|open|availability|available/.test(value)) return "hours";
  if (/feature|rooftop|outdoor|cocktail|bar|halal|vegan|vegetarian/.test(value)) return "feature";
  return "other";
}

function customerLabel(reason: string) {
  const value = cleanLabel(reason);
  if (!value) return "";
  if (/date[-\s]?night\s+fit/i.test(reason)) return "Fits your date-night request";
  if (/occasion\s+fit/i.test(reason)) return "Fits the occasion you requested";
  if (/casual|relaxed/i.test(reason)) return "Fits the vibe you requested";
  if (/cuisine/i.test(reason)) return titlePhrase(value.replace(/cuisine/i, "cuisine match"));
  if (/activity/i.test(reason)) return titlePhrase(value.replace(/activity/i, "activity match"));
  return titlePhrase(value);
}

export function buildLocationMatchReasonDetails(
  reasons: string[] | null | undefined,
): PublicMatchReason[] {
  const seen = new Set<string>();
  const output: PublicMatchReason[] = [];

  for (const reason of reasons ?? []) {
    if (typeof reason !== "string" || !reason.trim()) continue;
    const label = customerLabel(reason);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    output.push({
      type: classifyReason(reason),
      label,
      source: "search_evidence",
      confidence: "high",
    });
    if (output.length >= 5) break;
  }

  return output;
}

export function buildPairMatchReasonDetails(input: {
  reasons?: string[] | null;
  walkingMinutes?: number | null;
  distanceMiles?: number | null;
}): PublicMatchReason[] {
  const output = buildLocationMatchReasonDetails(input.reasons);
  const seen = new Set(output.map((item) => item.label.toLowerCase()));

  const walking = Number(input.walkingMinutes);
  if (Number.isFinite(walking) && walking > 0) {
    const label = `${Math.max(1, Math.round(walking))}-minute walk between stops`;
    if (!seen.has(label.toLowerCase())) {
      output.push({
        type: "walking",
        label,
        source: "pairing",
        confidence: "high",
      });
      seen.add(label.toLowerCase());
    }
  } else {
    const miles = Number(input.distanceMiles);
    if (Number.isFinite(miles) && miles >= 0) {
      const label = `${miles < 0.1 ? "<0.1" : miles.toFixed(1)} miles between stops`;
      if (!seen.has(label.toLowerCase())) {
        output.push({
          type: "distance",
          label,
          source: "pairing",
          confidence: "high",
        });
      }
    }
  }

  return output.slice(0, 5);
}
