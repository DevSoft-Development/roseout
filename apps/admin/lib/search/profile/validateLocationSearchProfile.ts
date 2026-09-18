import { canonicalTaxonomy } from "@/lib/search/v2/taxonomy";
import { hasStrongEvidence } from "./profileEvidence";
import { profileHash } from "./profileHash";
import { SEARCH_PROFILE_VERSION, type LocationProfileSource, type LocationSearchProfile, type ProfileValidationResult } from "./profileTypes";

export function validateLocationSearchProfile(profile: LocationSearchProfile, source?: LocationProfileSource, verifyHash = true): ProfileValidationResult {
  const reasons = new Set<string>();
  if (!profile.primaryDomain) reasons.add("missing_domain");
  if (!profile.supportedDomains.includes(profile.primaryDomain)) reasons.add("domain_contradiction");
  if (profile.audiences.includes("family") && profile.audiences.includes("adult_only")) reasons.add("family_adult_conflict");
  if (profile.confidence < 0.55) reasons.add("low_confidence");
  if (profile.latitude == null || profile.longitude == null) reasons.add("missing_coordinates");
  if (profile.profileVersion !== SEARCH_PROFILE_VERSION) reasons.add("stale_version");
  const known = new Set(canonicalTaxonomy.map((entry) => entry.id));
  for (const value of [...profile.restaurantCategories, ...profile.cuisines, ...profile.foods, ...profile.activityCategories, ...profile.nightlifeCategories, ...profile.mealPeriods, ...profile.features, ...profile.audiences, ...profile.occasions]) if (!known.has(value)) reasons.add(`unknown_taxonomy_id:${value}`);
  if (
    profile.mealPeriods.includes("dinner")
    && hasStrongEvidence(profile.evidence, "cafe")
    && !hasStrongEvidence(profile.evidence, "dinner")
  ) reasons.add("cafe_dinner_conflict");
  if (profile.activityCategories.includes("live_music") && !hasStrongEvidence(profile.evidence, "live_music")) reasons.add("supporting_only_live_music");
  if (profile.cuisines.length && profile.evidence.filter((item) => profile.cuisines.includes(item.value)).every((item) => item.field === "description")) reasons.add("cuisine_from_activity_only_metadata");
  if (source && (source.active === false || source.searchable === false || source.hidden || source.isLowLevel)) reasons.add("hidden_inactive_eligibility_conflict");
  const additions = profile.manualOverrides.add ?? {}; const removals = profile.manualOverrides.remove ?? {};
  for (const facet of Object.keys(additions) as Array<keyof typeof additions>) if ((additions[facet] ?? []).some((value) => removals[facet]?.includes(value))) reasons.add("conflicting_overrides");
  if (verifyHash) { const { profileHash: current, generatedAt, ...hashable } = profile; void generatedAt; if (current !== profileHash(hashable)) reasons.add("hash_mismatch"); }
  return { valid: reasons.size === 0, reasons: [...reasons].sort(), confidence: Math.max(0, Math.min(profile.confidence, reasons.has("domain_contradiction") ? 0.4 : 1)) };
}
