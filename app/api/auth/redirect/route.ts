import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

const LOCATION_OWNER_ROLES = new Set([
  "location_owner",
  "restaurant_owner",
  "restaurants",
  "owner",
]);

async function userOwnsLocation(userId: string, email?: string | null) {
  const normalizedEmail = email?.toLowerCase() || null;

  const ownershipChecks = [
    supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("owner_user_id", userId)
      .limit(1),
    supabaseAdmin
      .from("activities")
      .select("id")
      .eq("owner_user_id", userId)
      .limit(1),
    supabaseAdmin
      .from("restaurant_owners")
      .select("restaurant_id")
      .eq("user_id", userId)
      .limit(1),
    supabaseAdmin
      .from("activity_owners")
      .select("activity_id")
      .eq("user_id", userId)
      .limit(1),
  ];

  if (normalizedEmail) {
    ownershipChecks.push(
      supabaseAdmin
        .from("restaurant_owners")
        .select("restaurant_id")
        .ilike("email", normalizedEmail)
        .limit(1),
      supabaseAdmin
        .from("activity_owners")
        .select("activity_id")
        .ilike("email", normalizedEmail)
        .limit(1)
    );
  }

  const results = await Promise.all(ownershipChecks);

  return results.some(({ data, error }) => !error && Boolean(data?.length));
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ redirectPath: "/login" }, { status: 401 });
  }

  const email = user.email.toLowerCase();

  const { data: adminUser } = await supabaseAdmin
    .from("admin_users")
    .select("id, role")
    .eq("email", email)
    .maybeSingle();

  if (adminUser) {
    return NextResponse.json({ redirectPath: "/admin/dashboard" });
  }

  const metadataRole = String(user.user_metadata?.role || "").toLowerCase();

  if (
    LOCATION_OWNER_ROLES.has(metadataRole) ||
    (await userOwnsLocation(user.id, email))
  ) {
    return NextResponse.json({ redirectPath: "/locations/dashboard" });
  }

  return NextResponse.json({ redirectPath: "/user/dashboard" });
}
