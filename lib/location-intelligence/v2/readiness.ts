import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const REQUIRED_FIELDS = [
  "identity",
  "place_type",
  "geography",
  "operational_status",
  "classification",
] as const;

export function computeSearchV3Readiness(input: {
  hasIdentity: boolean;
  hasPlaceType: boolean;
  hasGeography: boolean;
  hasOperationalStatus: boolean;
  hasClassification: boolean;
  hasHours: boolean;
  hasFeatures: boolean;
  hasReviewIntelligence: boolean;
  negativeClassificationKnown: boolean;
}) {
  const hard = [
    input.hasIdentity,
    input.hasPlaceType,
    input.hasGeography,
    input.hasOperationalStatus,
    input.hasClassification,
    input.negativeClassificationKnown,
  ];
  const hardPass = hard.every(Boolean);
  const softCount = [input.hasHours, input.hasFeatures, input.hasReviewIntelligence].filter(Boolean).length;
  const qualityScore = Math.round((hard.filter(Boolean).length / hard.length) * 80 + (softCount / 3) * 20);
  return { searchV3Ready: hardPass && qualityScore >= 85, qualityScore, requiredFields: REQUIRED_FIELDS };
}

export async function refreshLocationReadiness(locationId: string) {
  const [{ data: location, error: locationError }, { data: identity, error: identityError }, { data: reviews, error: reviewsError }, { data: profile, error: profileError }] = await Promise.all([
    supabaseAdmin
      .from("locations")
      .select("id,location_type,primary_category,cuisine,cuisine_type,activity_type,city,state,zip_code,latitude,longitude,google_business_status,active,operating_hours,tags,vibe_tags,best_for_tags,is_low_level,low_level_reason")
      .eq("id", locationId)
      .single(),
    supabaseAdmin
      .from("location_external_identities")
      .select("provider,external_id")
      .eq("location_id", locationId)
      .eq("status", "active")
      .limit(10),
    supabaseAdmin
      .from("location_review_intelligence")
      .select("concept")
      .eq("location_id", locationId)
      .limit(1),
    supabaseAdmin
      .from("location_intelligence_profiles_v2")
      .select("classification,features,reviews")
      .eq("location_id", locationId)
      .maybeSingle(),
  ]);
  if (locationError) throw new Error(locationError.message);
  if (identityError) throw new Error(identityError.message);
  if (reviewsError) throw new Error(reviewsError.message);
  if (profileError) throw new Error(profileError.message);

  const classification = profile?.classification && typeof profile.classification === "object"
    ? profile.classification as Record<string, unknown>
    : {};
  const category = String(location?.primary_category || location?.cuisine || location?.cuisine_type || location?.activity_type || "").trim();
  const result = computeSearchV3Readiness({
    hasIdentity: Boolean(identity?.length),
    hasPlaceType: Boolean(String(location?.location_type || "").trim()),
    hasGeography: Boolean(location?.latitude != null && location?.longitude != null && location?.city && location?.state),
    hasOperationalStatus: Boolean(location?.google_business_status || location?.active != null),
    hasClassification: Boolean(category),
    hasHours: Boolean(
      location?.operating_hours ||
      (profile?.features && typeof profile.features === "object" && (profile.features as Record<string, unknown>).operating_hours)
    ),
    hasFeatures: Boolean(
      (location?.tags || []).length ||
      (location?.vibe_tags || []).length ||
      (location?.best_for_tags || []).length ||
      (profile?.features && typeof profile.features === "object" && Object.keys(profile.features as Record<string, unknown>).length)
    ),
    hasReviewIntelligence: Boolean(
      reviews?.length ||
      (profile?.reviews && typeof profile.reviews === "object" && Object.keys(profile.reviews as Record<string, unknown>).length)
    ),
    negativeClassificationKnown: classification.negativeClassificationKnown === true,
  });

  const { error } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .upsert({
      location_id: locationId,
      quality_score: result.qualityScore,
      search_v3_ready: result.searchV3Ready,
      updated_at: new Date().toISOString(),
    }, { onConflict: "location_id" });
  if (error) throw new Error(`Location readiness update failed: ${error.message}`);
  return result;
}
