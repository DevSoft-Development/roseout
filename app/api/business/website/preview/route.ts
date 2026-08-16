import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";
import { renderEnhancedWebsiteArtifact } from "@/lib/websites/content-artifact";
import { upgradeGeneratedReservationArtifact } from "@/lib/websites/native-reservation-artifact";
import { getGeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";
import type { BusinessWebsite, WebsiteSection } from "@/lib/websites/data";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const locationId = String(body?.location_id || "").trim();
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });

  const location = await getAuthorizedWebsiteLocation(user, locationId, "*");
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const renderLocation = await getGeneratedWebsiteLocationSnapshot(location as unknown as Record<string, unknown>);

  const website = {
    id: "preview",
    location_id: locationId,
    editor_status: "draft",
    site_title: typeof body.site_title === "string" ? body.site_title.trim().slice(0, 160) : renderLocation.name || renderLocation.title || "Your business",
    theme: body.theme && typeof body.theme === "object" && !Array.isArray(body.theme) ? body.theme : {},
    sections: Array.isArray(body.sections) ? body.sections as WebsiteSection[] : [],
    custom_content: body.custom_content && typeof body.custom_content === "object" && !Array.isArray(body.custom_content) ? body.custom_content : {},
    hosting_node_id: null,
    site_path: null,
    domain: null,
    platform_domain: null,
    published_version: null,
    last_publish_status: "not_published",
    last_error: null,
    published_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } satisfies BusinessWebsite;

  const files = upgradeGeneratedReservationArtifact(renderEnhancedWebsiteArtifact(website, renderLocation), locationId);
  const index = files.find((file) => file.path === "index.html");
  if (!index || (index.encoding && index.encoding !== "utf8")) {
    return NextResponse.json({ error: "Preview is unavailable." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, html: index.content });
}
