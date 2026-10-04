import "server-only";

import { classifyPublicLocation } from "@/lib/public-classification";
import {
  isLowLevelLocation,
  isStorefrontTakeoutRestaurant,
  normalizeSearchText,
} from "@/lib/search/lowLevel";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type NegativeLocationFlag =
  | "bakery_only"
  | "cafe_only"
  | "dessert_only"
  | "grocery"
  | "retail_only"
  | "catering_only"
  | "delivery_only"
  | "takeout_only"
  | "non_consumer"
  | "low_level";

function array(value: unknown) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function classificationText(row: Record<string, unknown>) {
  return normalizeSearchText([
    row.location_type,
    row.primary_category,
    row.cuisine,
    row.cuisine_type,
    row.activity_type,
    row.description,
    row.tags,
    row.semantic_tags,
    row.vibe_tags,
    row.best_for_tags,
    row.google_types,
    row.google_primary_type,
    row.search_keywords,
  ]);
}

function hasDestinationMealEvidence(row: Record<string, unknown>, text: string) {
  if (row.reservation_url || row.reservation_link || row.external_reservation_url) return true;
  if (row.operating_hours && /(dinner|lunch|brunch)/.test(text)) return true;
  return /(dinner|dining|restaurant|reservable|fine dining|steakhouse|seafood restaurant|sushi restaurant)/.test(text);
}

export function deriveLocationClassification(row: Record<string, unknown>) {
  const text = classificationText(row);
  const publicClassification = classifyPublicLocation(row);
  const mealEvidence = hasDestinationMealEvidence(row, text);
  const flags = new Set<NegativeLocationFlag>();

  if (/(grocery|supermarket|mini market|convenience store|bodega|food market)/.test(text)) flags.add("grocery");
  if (/(catering only|caterer|catering service)/.test(text) && !mealEvidence) flags.add("catering_only");
  if (/(delivery only|meal delivery|food delivery|delivery service)/.test(text) && !mealEvidence) flags.add("delivery_only");
  if (isStorefrontTakeoutRestaurant(row)) flags.add("takeout_only");
  if (/(bakery|pastry shop|cake shop)/.test(text) && !mealEvidence) flags.add("bakery_only");
  if (/(cafe|coffee shop)/.test(text) && !mealEvidence && !/restaurant/.test(text)) flags.add("cafe_only");
  if (/(dessert shop|ice cream|gelato|dessert)/.test(text) && !mealEvidence) flags.add("dessert_only");
  if (/(store|retail|shop|mall|pharmacy|liquor store|smoke shop)/.test(text) && publicClassification.domain === "other") flags.add("retail_only");
  if (publicClassification.domain === "other") flags.add("non_consumer");
  if (isLowLevelLocation(row)) flags.add("low_level");

  const positiveTags = Array.from(new Set([
    ...array(row.tags),
    ...array(row.vibe_tags),
    ...array(row.best_for_tags),
  ].map((value) => String(value || "").trim()).filter(Boolean)));

  return {
    domain: publicClassification.domain,
    primaryLabel: publicClassification.primaryLabel,
    secondaryLabels: publicClassification.secondaryLabels,
    publiclyDiscoverable: publicClassification.isPubliclyDiscoverable,
    exclusionReason: publicClassification.exclusionReason,
    negativeFlags: [...flags],
    positiveTags,
    negativeClassificationKnown: true,
  };
}

export async function refreshLocationClassificationV2(locationId: string) {
  const { data: location, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", locationId)
    .single();
  if (error) throw new Error(`Location classification read failed: ${error.message}`);

  const classification = deriveLocationClassification(location as Record<string, unknown>);
  const { error: updateError } = await supabaseAdmin
    .from("location_intelligence_profiles_v2")
    .upsert({
      location_id: locationId,
      classification,
      updated_at: new Date().toISOString(),
    }, { onConflict: "location_id" });
  if (updateError) throw new Error(`V2 classification update failed: ${updateError.message}`);
  return classification;
}
