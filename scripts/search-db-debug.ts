import { supabase } from "../lib/supabase";

async function countTable(table: string) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  return error ? null : count ?? 0;
}

async function fetchRows(table: string) {
  const { data, error } = await supabase.from(table).select("*").limit(2000);
  if (error) return [];
  return data ?? [];
}

function text(row: any) {
  return [row.name, row.title, row.category, row.categories, row.type, row.location_type, row.cuisine, row.cuisines, row.tags, row.description, row.address, row.neighborhood, row.borough, row.city, row.formatted_address, row.searchable_text]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");
}

function countMatching(rows: any[], tokens: string[]) {
  return rows.filter((r) => tokens.some((t) => text(r).includes(t))).length;
}

async function run() {
  const tables = ["locations", "restaurants", "activities"] as const;
  const inventory: Record<string, any[]> = {};
  for (const t of tables) inventory[t] = await fetchRows(t);

  const restaurants = [...inventory.restaurants, ...inventory.locations.filter((r) => text(r).includes("restaurant") || text(r).includes("steak") || text(r).includes("seafood") || text(r).includes("brunch"))];
  const activities = [...inventory.activities, ...inventory.locations.filter((r) => text(r).includes("activity") || text(r).includes("hookah") || text(r).includes("paint") || text(r).includes("bowling"))];

  const out = {
    total_locations: await countTable("locations"),
    total_restaurants: await countTable("restaurants"),
    total_activities: await countTable("activities"),
    restaurants_in_queens: restaurants.filter((r) => text(r).includes("queens")).length,
    activities_in_queens: activities.filter((r) => text(r).includes("queens")).length,
    steak_or_steakhouse: countMatching([...restaurants, ...activities], ["steak", "steakhouse"]),
    seafood: countMatching([...restaurants, ...activities], ["seafood"]),
    hookah: countMatching([...restaurants, ...activities], ["hookah", "shisha"]),
    paint_sip_painting: countMatching([...restaurants, ...activities], ["paint", "sip", "painting"]),
    bowling: countMatching([...restaurants, ...activities], ["bowling"]),
  };

  console.log(JSON.stringify(out, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
