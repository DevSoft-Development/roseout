import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { getAppSession } from "@/lib/app-session";
import { getAdminDashboardAccess } from "@/lib/account-permissions";

function adminSupabase() {
  return createSupabaseServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const sessionSupabase = await createClient();
  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();
  const appSession = await getAppSession();
  const access = await getAdminDashboardAccess({
    id: user?.id || appSession?.id || null,
    email: user?.email || appSession?.email || null,
    role: user?.user_metadata?.role || appSession?.role || null,
  });

  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const rawType = searchParams.get("type") || "";
  const table = rawType === "activities" || rawType === "activity" ? "activities" : "restaurants";
  const nameColumn = table === "activities" ? "activity_name" : "restaurant_name";

  if (!id) {
    return NextResponse.json({ error: "Location id is required." }, { status: 400 });
  }

  const { data, error } = await adminSupabase()
    .from(table)
    .select(`id, ${nameColumn}, address, city, state, zip_code, claim_url, qr_code_data_url, claim_status, claimed`)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const locationName = table === "activities"
    ? (data as { activity_name?: string | null }).activity_name
    : (data as { restaurant_name?: string | null }).restaurant_name;

  return NextResponse.json({
    location: {
      id: data.id,
      type: table,
      name: locationName,
      address: data.address,
      city: data.city,
      state: data.state,
      zip_code: data.zip_code,
      claim_url: data.claim_url,
      qr_code_data_url: data.qr_code_data_url,
      claim_status: data.claim_status,
      claimed: data.claimed,
    },
  });
}
