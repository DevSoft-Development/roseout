import { normalizeClaimCode } from "@/lib/claimQr";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type ClaimLocationRow = {
  id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  address?: string | null;
  city?: string | null;
  borough?: string | null;
  state?: string | null;
  zip_code?: string | null;
  location_type?: string | null;
  primary_category?: string | null;
  phone?: string | null;
  website?: string | null;
  claim_status?: string | null;
  is_claimed?: boolean | null;
  claimed?: boolean | null;
  owner_user_id?: string | null;
  claimed_by_email?: string | null;
  claimed_by?: string | null;
};

const SAFE_LOCATION_SELECT =
  "id, name, restaurant_name, activity_name, address, city, borough, state, zip_code, location_type, primary_category, phone, website, claim_status, is_claimed, claimed, owner_user_id, claimed_by, claimed_by_email";

function publicLocation(row: ClaimLocationRow) {
  return {
    id: row.id,
    name: row.name || row.restaurant_name || row.activity_name || "TheOutHaven location",
    address: row.address || null,
    city: row.city || null,
    borough: row.borough || null,
    state: row.state || null,
    zipCode: row.zip_code || null,
    locationType: row.location_type || null,
    primaryCategory: row.primary_category || null,
    phone: row.phone || null,
    website: row.website || null,
    claimStatus: row.claim_status || (row.is_claimed || row.claimed ? "claimed" : "unclaimed"),
  };
}

function blockedError(row: ClaimLocationRow) {
  const status = String(row.claim_status || "").toLowerCase();

  if (status === "redeemed" || status === "approved_redeemed") return "used_code";
  if (status === "expired") return "expired_code";
  if (status === "disabled") return "disabled_code";
  return null;
}

async function findLocationByCode(code: string) {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(SAFE_LOCATION_SELECT)
    .eq("claim_code", code)
    .maybeSingle();

  if (error) throw error;
  if (data) return data as ClaimLocationRow;

  for (const table of ["restaurants", "activities"] as const) {
    const nameColumn = table === "restaurants" ? "restaurant_name" : "activity_name";
    const { data: source, error: sourceError } = await supabaseAdmin
      .from(table)
      .select(
        `id, name, ${nameColumn}, address, city, borough, state, zip_code, primary_category, phone, website, claim_status, is_claimed, claimed, owner_user_id, claimed_by, claimed_by_email`,
      )
      .eq("claim_code", code)
      .maybeSingle();

    if (sourceError) throw sourceError;
    if (source) {
      return {
        ...source,
        location_type: table === "restaurants" ? "restaurant" : "activity",
      } as ClaimLocationRow;
    }
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = normalizeClaimCode(body.code);

    if (!code) {
      return Response.json({ ok: false, error: "empty_code" }, { status: 400 });
    }

    const location = await findLocationByCode(code);

    if (!location) {
      return Response.json({ ok: false, error: "invalid_code" }, { status: 404 });
    }

    const blocked = blockedError(location);
    if (blocked) {
      return Response.json({ ok: false, error: blocked }, { status: 409 });
    }

    return Response.json({
      ok: true,
      claimCodeId: code,
      location: publicLocation(location),
    });
  } catch {
    return Response.json({ ok: false, error: "invalid_code" }, { status: 500 });
  }
}
