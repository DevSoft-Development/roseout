import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function websiteName(row: { site_title?: string | null; location_name?: string | null }) {
  return row.location_name || row.site_title || "Untitled website";
}

export async function GET() {
  const { error: authError } = await requireSuperAdmin();
  if (authError) return authError;

  const { data: websites, error } = await supabaseAdmin
    .from("business_websites")
    .select("id,location_id,site_title,domain,platform_domain,status,deployment_status,last_publish_status,published_version,published_at,created_at,updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Unable to load generated websites", error);
    return NextResponse.json({ ok: false, error: "Unable to load generated websites." }, { status: 500 });
  }

  const locationIds = Array.from(new Set((websites || []).map((row) => String(row.location_id)).filter(Boolean)));
  let locationNames = new Map<string, string>();

  if (locationIds.length) {
    const { data: locations, error: locationError } = await supabaseAdmin
      .from("locations")
      .select("id,name,title")
      .in("id", locationIds);

    if (locationError) {
      console.error("Unable to load website location names", locationError);
    } else {
      locationNames = new Map(
        (locations || []).map((location) => [
          String(location.id),
          String(location.name || location.title || "Untitled location"),
        ]),
      );
    }
  }

  return NextResponse.json({
    ok: true,
    websites: (websites || []).map((row) => ({
      ...row,
      location_name: locationNames.get(String(row.location_id)) || row.site_title || "Untitled location",
    })),
  });
}

export async function DELETE(request: NextRequest) {
  const { error: authError, adminUser } = await requireSuperAdmin();
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const websiteId = String(body?.website_id || "").trim();
  const locationId = String(body?.location_id || "").trim();
  const confirmation = String(body?.confirmation || "").trim();

  if (!websiteId || !locationId) {
    return NextResponse.json({ ok: false, error: "Choose a location website to delete." }, { status: 400 });
  }
  if (confirmation !== "DELETE") {
    return NextResponse.json({ ok: false, error: "Type DELETE to confirm this website reset." }, { status: 400 });
  }

  const { data: website, error: lookupError } = await supabaseAdmin
    .from("business_websites")
    .select("id,location_id,site_title,domain,platform_domain,last_publish_status,published_version")
    .eq("id", websiteId)
    .eq("location_id", locationId)
    .maybeSingle();

  if (lookupError) {
    console.error("Website reset lookup failed", lookupError);
    return NextResponse.json({ ok: false, error: "Unable to verify this website." }, { status: 500 });
  }
  if (!website) return NextResponse.json({ ok: false, error: "Website not found." }, { status: 404 });
  if (website.last_publish_status === "publishing") {
    return NextResponse.json({ ok: false, error: "Wait for the current publish to finish before deleting this website." }, { status: 409 });
  }

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("id,name,title")
    .eq("id", locationId)
    .maybeSingle();

  const locationName = String(location?.name || location?.title || website.site_title || "Untitled location");
  const wasPublished = Boolean(website.published_version);

  const { error: deleteError } = await supabaseAdmin
    .from("business_websites")
    .delete()
    .eq("id", websiteId)
    .eq("location_id", locationId);

  if (deleteError) {
    console.error("Website reset delete failed", deleteError);
    return NextResponse.json({ ok: false, error: "Unable to delete this location website." }, { status: 500 });
  }

  console.info("Admin deleted location website", {
    websiteId,
    locationId,
    locationName: websiteName({ site_title: website.site_title, location_name: locationName }),
    adminUserId: adminUser?.user_id || null,
    wasPublished,
  });

  return NextResponse.json({
    ok: true,
    website_id: websiteId,
    location_id: locationId,
    location_name: locationName,
    was_published: wasPublished,
    message: wasPublished
      ? "Website builder data and publish history were deleted. The location and any registered domain were preserved. A previously published static copy can remain reachable until hosting cleanup or the next publish replaces it."
      : "Website builder data was deleted. The location and any registered domain were preserved.",
  });
}
