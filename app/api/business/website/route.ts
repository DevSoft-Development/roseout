import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { defaultWebsiteSections } from "@/lib/websites/data";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";
import { getWebsiteLiveUrl } from "@/lib/websites/platform-domain";

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function withLiveAddress<T extends { domain?: string | null; platform_domain?: string | null }>(website: T) {
  return {
    ...website,
    live_url: getWebsiteLiveUrl(website),
  };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
  const locationId = new URL(request.url).searchParams.get("location_id")?.trim();
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });
  const location = await getAuthorizedWebsiteLocation(user, locationId, "id,name,title");
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const locationSummary = location as unknown as {
    id: string;
    name?: string | null;
    title?: string | null;
  };
  const locationName = locationSummary.name || locationSummary.title || null;

  const { data: existing } = await supabaseAdmin.from("business_websites").select("*").eq("location_id", locationId).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, website: withLiveAddress(existing) });

  const { data, error } = await supabaseAdmin.from("business_websites").insert({
    location_id: locationId,
    editor_status: "draft",
    site_title: locationName || "Your business",
    sections: defaultWebsiteSections,
    theme: { preset: "signature", radius: "soft", density: "comfortable" },
    status: "provisioning",
    deployment_status: "pending",
    dns_status: "pending",
    ssl_status: "pending",
  }).select("*").single();
  if (error) return NextResponse.json({ error: "Website builder setup is not available yet." }, { status: 503 });
  return NextResponse.json({ ok: true, website: withLiveAddress(data) });
}

export async function PATCH(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const locationId = String(body?.location_id || "").trim();
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });
  const location = await getAuthorizedWebsiteLocation(user, locationId, "id");
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const incomingTheme = objectValue(body.theme);
  const incomingCustomContent = objectValue(body.custom_content);
  let currentTheme: Record<string, unknown> = {};
  let currentCustomContent: Record<string, unknown> = {};

  if (incomingTheme || incomingCustomContent) {
    const { data: current, error: currentError } = await supabaseAdmin
      .from("business_websites")
      .select("theme,custom_content")
      .eq("location_id", locationId)
      .single();
    if (currentError) return NextResponse.json({ error: "Unable to load website changes." }, { status: 500 });
    currentTheme = objectValue(current.theme) || {};
    currentCustomContent = objectValue(current.custom_content) || {};
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.site_title === "string") updates.site_title = body.site_title.trim().slice(0, 160) || null;
  if (incomingTheme) updates.theme = { ...currentTheme, ...incomingTheme };
  if (Array.isArray(body.sections)) updates.sections = body.sections;
  if (incomingCustomContent) updates.custom_content = { ...currentCustomContent, ...incomingCustomContent };

  const { data, error } = await supabaseAdmin.from("business_websites").update(updates).eq("location_id", locationId).select("*").single();
  if (error) return NextResponse.json({ error: "Unable to save website changes." }, { status: 500 });
  return NextResponse.json({ ok: true, website: withLiveAddress(data) });
}
