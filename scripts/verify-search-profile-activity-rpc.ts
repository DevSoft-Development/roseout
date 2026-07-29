import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, key, { auth: { persistSession: false } });
const categories = ["bowling", "karaoke", "live_music", "comedy", "gallery"] as const;

async function main() {
  const failures: string[] = [];
  for (const category of categories) {
    const { data, error } = await supabase.rpc("enterprise_search_profile_candidates", {
      p_search_terms: [category],
      p_domain: "activity",
      p_activity_categories: [category],
      p_latitude: 40.758,
      p_longitude: -73.9855,
      p_radius_miles: 45,
      p_limit: 25,
    });
    if (error) {
      failures.push(`${category}: ${error.message}`);
      continue;
    }
    const rows = Array.isArray(data) ? data : [];
    const valid = rows.filter((row: Record<string, unknown>) => {
      const activityCategories = Array.isArray(row.activity_categories) ? row.activity_categories.map(String) : [];
      const supportedDomains = Array.isArray(row.supported_domains) ? row.supported_domains.map(String) : [];
      const latitude = Number(row.latitude);
      const longitude = Number(row.longitude);
      return activityCategories.includes(category)
        && supportedDomains.includes("activity")
        && Number.isFinite(latitude)
        && Number.isFinite(longitude);
    });
    console.log(JSON.stringify({ category, returned: rows.length, valid: valid.length }));
    if (!valid.length) failures.push(`${category}: no valid activity profile candidates returned`);
  }
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
