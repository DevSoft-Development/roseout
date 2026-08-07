import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MIRROR_DEMO_KEY } from "@/lib/demo/demo-center";
import { normalizeRole } from "@/lib/users/roles";

const ALLOWED_ROLES = new Set([
  "superadmin",
  "admin",
  "ambassador",
  "partner_ambassador",
]);

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: adminUser, error: adminError }, { data: userProfile }] =
    await Promise.all([
      supabaseAdmin
        .from("admin_users")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

  const role = normalizeRole(adminUser?.role || userProfile?.role);
  if (adminError || !role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: location, error } = await supabaseAdmin
    .from("locations")
    .select(
      "id,name,restaurant_name,activity_name,location_type,primary_category,address,city,state,zip_code,main_image,image_url,images,is_demo,demo_key,is_searchable,is_hidden,reservation_mode,reservation_enabled,internal_reservations_enabled,uses_internal_reservations,reservation_source",
    )
    .eq("demo_key", MIRROR_DEMO_KEY)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Unable to load TheOutHaven Lounge." },
      { status: 500 },
    );
  }

  if (!location?.id) {
    return NextResponse.json(
      { error: "TheOutHaven Lounge test fixture is missing." },
      { status: 404 },
    );
  }

  const id = String(location.id);
  const context = new URLSearchParams({
    adminLocationId: id,
    locationId: id,
    type: "restaurant",
    demo: "1",
    fromDemoCenter: "1",
    fromCreate: "1",
  }).toString();

  return NextResponse.json({
    location: {
      ...location,
      publicViewHref: `/locations/restaurant/${encodeURIComponent(id)}?${context}`,
      locationDashboardHref: `/locations/dashboard?${context}`,
      reservationHref: `/reserve/location/${encodeURIComponent(id)}?${context}`,
      reviewHref: `/locations/restaurant/${encodeURIComponent(id)}/review?${context}`,
    },
  });
}
