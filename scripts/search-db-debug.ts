import { supabase } from "../lib/supabase";

function text(row: any) {
  return [row.name, row.title, row.category, row.categories, row.type, row.location_type, row.cuisine, row.cuisines, row.tags, row.description, row.address, row.neighborhood, row.borough, row.city, row.formatted_address, row.searchable_text]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");
}

function countMatching(rows: any[], terms: string[]) {
  return rows.filter((r) => terms.some((t) => text(r).includes(t))).length;
}

async function run() {
  const { data } = await supabase.from("locations").select("*").limit(5000);
  const rows = data ?? [];
  const restaurants = rows.filter((r) => ["restaurant", "food", "dining", "steak", "seafood", "brunch"].some((m) => text(r).includes(m)));
  const activities = rows.filter((r) => ["activity", "lounge", "nightlife", "hookah", "paint", "bowling"].some((m) => text(r).includes(m)));

  const out = {
    total_locations: rows.length,
    total_restaurants: restaurants.length,
    total_activities: activities.length,
    restaurants_in_queens: restaurants.filter((r) => text(r).includes("queens")).length,
    activities_in_queens: activities.filter((r) => text(r).includes("queens")).length,
    steak_or_steakhouse: countMatching(rows, ["steak", "steakhouse"]),
    seafood: countMatching(rows, ["seafood"]),
    hookah: countMatching(rows, ["hookah", "shisha"]),
    paint_sip_painting: countMatching(rows, ["paint", "sip", "painting"]),
    bowling: countMatching(rows, ["bowling"]),
  };

  console.log(JSON.stringify(out, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
