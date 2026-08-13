import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { defaultWebsiteSections } from "@/lib/websites/data";
import { publishWebsiteToLightsail } from "@/lib/hosting/website-publish-gateway";

async function ownedLocation(user: { id: string; email?: string | null }, locationId: string) {
  const { data } = await supabaseAdmin
    .from("locations")
    .select("id,name,title")
    .eq("id", locationId)
    .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
    .maybeSingle();
  return data || null;
}

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
  const locationId = new URL(request.url).searchParams.get("location_id")?.trim();
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });
  const location = await ownedLocation(user, locationId);
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const { data: existing } = await supabaseAdmin.from("location_websites").select("*").eq("location_id", locationId).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, website: existing });

  const { data, error } = await supabaseAdmin.from("location_websites").insert({
    location_id: locationId,
    site_title: location.name || location.title || "Your business",
    sections: defaultWebsiteSections,
    theme: { preset: "signature", radius: "soft", density: "comfortable" },
  }).select("*").single();
  if (error) return NextResponse.json({ error: "Website builder setup is not available yet." }, { status: 503 });
  return NextResponse.json({ ok: true, website: data });
}

export async function PATCH(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const locationId = String(body?.location_id || "").trim();
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });
  const location = await ownedLocation(user, locationId);
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.site_title === "string") updates.site_title = body.site_title.trim().slice(0, 160) || null;
  if (body.theme && typeof body.theme === "object" && !Array.isArray(body.theme)) updates.theme = body.theme;
  if (Array.isArray(body.sections)) updates.sections = body.sections;
  if (body.custom_content && typeof body.custom_content === "object" && !Array.isArray(body.custom_content)) updates.custom_content = body.custom_content;

  const { data, error } = await supabaseAdmin.from("location_websites").update(updates).eq("location_id", locationId).select("*").single();
  if (error) return NextResponse.json({ error: "Unable to save website changes." }, { status: 500 });
  return NextResponse.json({ ok: true, website: data });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const locationId = String(body?.location_id || "").trim();
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });
  const location = await ownedLocation(user, locationId);
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const { data: website } = await supabaseAdmin.from("location_websites").select("*").eq("location_id", locationId).maybeSingle();
  if (!website || website.status === "draft") return NextResponse.json({ error: "Finish generating or editing the website before publishing." }, { status: 409 });

  const { data: assignment } = await supabaseAdmin.from("business_websites").select("id,domain,site_path,status,deployment_status,dns_status,ssl_status").eq("location_id", locationId).maybeSingle();
  if (!assignment) return NextResponse.json({ error: "Connect the business domain to Lightsail before publishing." }, { status: 409 });

  const { data: latest } = await supabaseAdmin.from("location_website_versions").select("version,snapshot").eq("website_id", website.id).order("version", { ascending: false }).limit(1).maybeSingle();
  if (!latest?.snapshot) return NextResponse.json({ error: "No publishable website version was found." }, { status: 409 });

  const startedAt = new Date().toISOString();
  await supabaseAdmin.from("business_websites").update({ status: "deploying", deployment_status: "deploying", last_error: null, updated_at: startedAt }).eq("id", assignment.id);
  await supabaseAdmin.from("location_websites").update({ last_publish_status: "publishing", last_publish_error: null, updated_at: startedAt }).eq("id", website.id);

  try {
    const result = await publishWebsiteToLightsail({ locationId, domain: assignment.domain, sitePath: assignment.site_path, version: latest.version, snapshot: latest.snapshot as Record<string, unknown> });
    const publishedAt = new Date().toISOString();
    await supabaseAdmin.from("business_websites").update({ status: "live", deployment_status: "deployed", deployment_version: String(latest.version), ssl_status: result.sslStatus === "active" ? "active" : assignment.ssl_status, last_deployed_at: publishedAt, last_error: null, updated_at: publishedAt }).eq("id", assignment.id);
    await supabaseAdmin.from("location_websites").update({ status: "published", last_publish_status: "published", last_publish_error: null, published_version: latest.version, published_at: publishedAt, updated_at: publishedAt }).eq("id", website.id);
    await supabaseAdmin.from("location_website_versions").update({ published_at: publishedAt }).eq("website_id", website.id).eq("version", latest.version);
    return NextResponse.json({ ok: true, domain: assignment.domain, version: latest.version, deployment_id: result.deploymentId || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "website_publish_failed";
    const failedAt = new Date().toISOString();
    await supabaseAdmin.from("business_websites").update({ status: "failed", deployment_status: "failed", last_error: message.slice(0, 500), updated_at: failedAt }).eq("id", assignment.id);
    await supabaseAdmin.from("location_websites").update({ last_publish_status: "failed", last_publish_error: message.slice(0, 500), updated_at: failedAt }).eq("id", website.id);
    return NextResponse.json({ error: "Website publishing failed. Your current live version was not replaced." }, { status: 502 });
  }
}
