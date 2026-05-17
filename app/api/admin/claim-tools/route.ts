import { requireAdminApiRole } from "@/lib/admin-api-auth";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim().slice(0, 100);
}

function escapedLike(value: string) {
  return `%${value.replace(/[,%]/g, " ").replace(/\s+/g, " ")}%`;
}

type ClaimToolApiResult = {
  id: string;
  location_id: string | null;
  name: string;
  type: string;
  address: unknown;
  city: unknown;
  state: unknown;
  source_table: unknown;
  source_id: unknown;
  claim_status: unknown;
  is_claimed: boolean;
  claim_code: unknown;
  claim_url: unknown;
  qr_code_data_url: unknown;
};

function getName(row: Record<string, unknown>) {
  return String(row.name || row.restaurant_name || row.activity_name || "Untitled location");
}

function mapLocation(row: Record<string, unknown>): ClaimToolApiResult {
  return {
    id: String(row.id),
    location_id: String(row.id),
    name: getName(row),
    type: String(row.location_type || row.source_table || "location"),
    address: row.address || null,
    city: row.city || null,
    state: row.state || null,
    source_table: row.source_table || "locations",
    source_id: row.source_id || row.id,
    claim_status: row.claim_status || null,
    is_claimed: Boolean(row.is_claimed || row.claimed),
    claim_code: row.claim_code || null,
    claim_url: row.claim_url || null,
    qr_code_data_url: row.qr_code_data_url || row.claim_qr_url || null,
  };
}

function mapSource(row: Record<string, unknown>, table: "restaurants" | "activities"): ClaimToolApiResult {
  return {
    id: `${table}-${row.id}`,
    location_id: null,
    name: getName(row),
    type: table === "restaurants" ? "restaurant" : "activity",
    address: row.address || null,
    city: row.city || null,
    state: row.state || null,
    source_table: table,
    source_id: row.id,
    claim_status: row.claim_status || null,
    is_claimed: Boolean(row.is_claimed || row.claimed),
    claim_code: row.claim_code || null,
    claim_url: row.claim_url || null,
    qr_code_data_url: row.qr_code_data_url || row.claim_qr_url || null,
  };
}

export async function GET(req: Request) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor", "viewer"]);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const q = clean(searchParams.get("q"));

  if (q.length < 2) return Response.json({ results: [] });

  const search = escapedLike(q);
  const locationOr = [
    `name.ilike.${search}`,
    `restaurant_name.ilike.${search}`,
    `activity_name.ilike.${search}`,
    `address.ilike.${search}`,
    `city.ilike.${search}`,
    `state.ilike.${search}`,
    `phone.ilike.${search}`,
    `google_place_id.ilike.${search}`,
    `claim_code.ilike.${search}`,
  ].join(",");

  const { data: locations, error: locationError } = await auth.supabase
    .from("locations")
    .select("id, name, restaurant_name, activity_name, location_type, address, city, state, source_table, source_id, claim_status, is_claimed, claimed, claim_code, claim_url, claim_qr_url, qr_code_data_url")
    .or(locationOr)
    .limit(25);

  if (locationError) return Response.json({ error: locationError.message }, { status: 500 });

  const seen = new Set((locations || []).map((row) => `${row.source_table}-${row.source_id}`));
  const results: ClaimToolApiResult[] = (locations || []).map(mapLocation);

  for (const table of ["restaurants", "activities"] as const) {
    const nameColumn = table === "restaurants" ? "restaurant_name" : "activity_name";
    const { data, error } = await auth.supabase
      .from(table)
      .select(`id, name, ${nameColumn}, address, city, state, phone, google_place_id, claim_status, is_claimed, claimed, claim_code, claim_url, claim_qr_url, qr_code_data_url`)
      .or([
        `name.ilike.${search}`,
        `${nameColumn}.ilike.${search}`,
        `address.ilike.${search}`,
        `city.ilike.${search}`,
        `state.ilike.${search}`,
        `phone.ilike.${search}`,
        `google_place_id.ilike.${search}`,
        `claim_code.ilike.${search}`,
      ].join(","))
      .limit(15);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    for (const row of data || []) {
      const key = `${table}-${row.id}`;
      if (!seen.has(key)) results.push(mapSource(row, table));
    }
  }

  return Response.json({ results: results.slice(0, 40) });
}
