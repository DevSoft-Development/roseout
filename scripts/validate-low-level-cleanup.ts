import { createClient } from "@supabase/supabase-js";
import { isLowLevelLocation, isUnverifiedNycRestaurant, userExplicitlyAskedForLowLevel } from "../lib/search/lowLevel";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function assert(name: string, condition: boolean) {
  if (!condition) throw new Error(`Validation failed: ${name}`);
  console.log(`PASS ${name}`);
}

async function main() {
  assert("birthday dinner does not allow low-level intent", !userExplicitlyAskedForLowLevel("birthday dinner with lounge"));
  assert("Chinese takeout allows low-level intent", userExplicitlyAskedForLowLevel("Chinese takeout near Queens"));

  if (!url || !key) {
    console.warn("Skipping Supabase checks because Supabase env vars are not configured.");
    return;
  }

  const supabase = createClient(url, key);
  const { data: publicRows, error } = await supabase
    .from("locations")
    .select("id,name,restaurant_name,activity_name,location_type,is_low_level,public_visibility_tier,curation_tier,source_quality_status,import_confidence,has_photos,photo_status,source,source_table,import_source,rating,review_count,is_searchable,data_status,is_hidden,status,quality_status,duplicate_status,main_image,image_url")
    .eq("is_searchable", true)
    .eq("data_status", "clean")
    .limit(250);

  if (error) throw error;

  const lowLevelPublic = (publicRows || []).filter((row) => isLowLevelLocation(row) || isUnverifiedNycRestaurant(row));
  assert("public searchable sample excludes low-level/unverified records", lowLevelPublic.length === 0);

  const { data: summary, error: summaryError } = await supabase
    .from("admin_low_level_location_summary")
    .select("total_locations,total_low_level,nyc_import_unverified")
    .single();
  if (summaryError) throw summaryError;
  assert("admin summary view is queryable", Number(summary?.total_locations || 0) >= 0);

  const { error: rpcError } = await supabase.rpc("oh_cleanup_low_level_locations");
  if (rpcError) throw rpcError;
  assert("cleanup RPC executes", true);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
