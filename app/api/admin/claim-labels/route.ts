import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiRole } from "@/lib/admin-api-auth";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET() {
  const { error } = await requireAdminApiRole(["superuser", "admin"]);
  if (error) return error;

  const supabase = adminSupabase();
  const [restaurants, activities] = await Promise.all([
    supabase
      .from("restaurants")
      .select("id, restaurant_name, address, city, state, zip_code, status, claimed, claim_url, qr_code_data_url")
      .order("restaurant_name", { ascending: true }),
    supabase
      .from("activities")
      .select("id, activity_name, address, city, state, zip_code, status, claimed, claim_url, qr_code_data_url")
      .order("activity_name", { ascending: true }),
  ]);

  if (restaurants.error) {
    return NextResponse.json({ error: restaurants.error.message }, { status: 500 });
  }

  if (activities.error) {
    return NextResponse.json({ error: activities.error.message }, { status: 500 });
  }

  return NextResponse.json({
    locations: [
      ...(restaurants.data || []).map((item) => ({
        id: item.id,
        type: "restaurants",
        name: item.restaurant_name,
        address: item.address,
        city: item.city,
        state: item.state,
        zip_code: item.zip_code,
        status: item.status,
        claimed: item.claimed,
        claim_url: item.claim_url,
        qr_code_data_url: item.qr_code_data_url,
      })),
      ...(activities.data || []).map((item) => ({
        id: item.id,
        type: "activities",
        name: item.activity_name,
        address: item.address,
        city: item.city,
        state: item.state,
        zip_code: item.zip_code,
        status: item.status,
        claimed: item.claimed,
        claim_url: item.claim_url,
        qr_code_data_url: item.qr_code_data_url,
      })),
    ],
  });
}
