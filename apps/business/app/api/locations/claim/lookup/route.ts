import { createClient } from "@supabase/supabase-js";
import { normalizeClaimCode } from "@/lib/claimQr";

export const dynamic = "force-dynamic";

type LookupMode = "token" | "code";

type ClaimLocation = {
  id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  location_type?: string | null;
  primary_category?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  main_image?: string | null;
  image_url?: string | null;
  source_table?: string | null;
  source_id?: string | null;
  is_claimed?: boolean | null;
  claim_status?: string | null;
};

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const PUBLIC_LOCATION_SELECT =
  "id, name, restaurant_name, activity_name, location_type, primary_category, address, city, state, zip_code, main_image, image_url, source_table, source_id, is_claimed, claim_status";

function removePrivateFields(location: ClaimLocation) {
  return location;
}

async function lookupLocations(mode: LookupMode, value: string) {
  const column = mode === "token" ? "claim_token" : "claim_code";
  const { data, error } = await adminSupabase()
    .from("locations")
    .select(PUBLIC_LOCATION_SELECT)
    .eq(column, value)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as ClaimLocation | null;
}

async function lookupSource(
  table: "restaurants" | "activities",
  mode: LookupMode,
  value: string,
) {
  const column = mode === "token" ? "claim_token" : "claim_code";
  const nameColumn =
    table === "restaurants" ? "restaurant_name" : "activity_name";
  const { data, error } = await adminSupabase()
    .from(table)
    .select(
      `id, name, ${nameColumn}, primary_category, address, city, state, zip_code, main_image, image_url, is_claimed, claim_status`,
    )
    .eq(column, value)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    location_type: table === "restaurants" ? "restaurant" : "activity",
    source_table: table,
    source_id: String(data.id),
  } as ClaimLocation;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token")?.trim();
  const rawCode = searchParams.get("code");
  const code = normalizeClaimCode(rawCode || "");

  if (!token && !code) {
    return Response.json(
      { error: "Enter a claim code or open a valid QR claim link." },
      { status: 400 },
    );
  }

  try {
    const mode: LookupMode = token ? "token" : "code";
    const value = token || code;

    const location =
      (await lookupLocations(mode, value)) ||
      (await lookupSource("restaurants", mode, value)) ||
      (await lookupSource("activities", mode, value));

    if (!location) {
      return Response.json(
        { error: "Claim code or QR link was not found." },
        { status: 404 },
      );
    }

    return Response.json({
      location: removePrivateFields(location),
      claimAccess: { mode, value },
    });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Server error" },
      { status: 500 },
    );
  }
}
