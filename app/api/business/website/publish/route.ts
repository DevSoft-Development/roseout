import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { allocateLightsailWebsiteNode } from "@/lib/hosting/lightsail-nodes";
import { deployWebsiteArtifact } from "@/lib/websites/deploy-client";
import { renderWebsiteArtifact } from "@/lib/websites/static-renderer";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";
import type { BusinessWebsite } from "@/lib/websites/data";

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const locationId = String(body?.location_id || "").trim();
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });

  let websiteId: string | null = null;
  let version: number | null = null;

  try {
    const location = await getAuthorizedWebsiteLocation(user, locationId, "*");
    if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

    const locationRecord = location as unknown as Record<string, unknown>;
    const renderLocation = {
      id: nullableString(locationRecord.id) || locationId,
      name: nullableString(locationRecord.name),
      title: nullableString(locationRecord.title),
      address: nullableString(locationRecord.address),
      phone: nullableString(locationRecord.phone),
      hours: nullableString(locationRecord.hours),
      reservation_link: nullableString(locationRecord.reservation_link),
      image_url: nullableString(locationRecord.image_url),
    };

    const { data: websiteRow, error: websiteError } = await supabaseAdmin
      .from("business_websites")
      .select("*")
      .eq("location_id", locationId)
      .maybeSingle();
    if (websiteError) throw websiteError;
    if (!websiteRow) return NextResponse.json({ error: "Create the website draft before publishing." }, { status: 409 });

    websiteId = websiteRow.id;

    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("business_websites")
      .update({ last_publish_status: "publishing", deployment_status: "deploying", last_error: null, updated_at: new Date().toISOString() })
      .eq("id", websiteId)
      .neq("last_publish_status", "publishing")
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return NextResponse.json({ error: "This website is already publishing." }, { status: 409 });

    const allocation = await allocateLightsailWebsiteNode(locationId, websiteRow.domain || null);
    const { data: refreshed, error: refreshedError } = await supabaseAdmin
      .from("business_websites")
      .select("*")
      .eq("id", websiteId)
      .single();
    if (refreshedError) throw refreshedError;

    const website = refreshed as BusinessWebsite;
    const { data: latestVersion, error: versionError } = await supabaseAdmin
      .from("business_website_versions")
      .select("version")
      .eq("website_id", website.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionError) throw versionError;
    version = Number(latestVersion?.version || 0) + 1;

    const snapshot = {
      website: {
        site_title: website.site_title,
        theme: website.theme,
        sections: website.sections,
        custom_content: website.custom_content,
        domain: website.domain,
      },
      location: locationRecord,
    };

    const { error: snapshotError } = await supabaseAdmin.from("business_website_versions").insert({
      website_id: website.id,
      version,
      snapshot,
      source: "publish",
      created_by: user.id,
    });
    if (snapshotError) throw snapshotError;

    const files = renderWebsiteArtifact(website, renderLocation);
    const result = await deployWebsiteArtifact({
      websiteId: website.id,
      locationId,
      version,
      sitePath: allocation.website.site_path || `/srv/sites/${locationId}`,
      domain: website.domain || null,
      files,
    });

    const publishedAt = new Date().toISOString();
    const { error: finalizeError } = await supabaseAdmin
      .from("business_websites")
      .update({
        editor_status: "published",
        status: "live",
        deployment_status: "deployed",
        deployment_version: String(version),
        published_version: version,
        last_publish_status: "published",
        last_deployed_at: publishedAt,
        published_at: publishedAt,
        last_error: null,
        updated_at: publishedAt,
      })
      .eq("id", website.id);
    if (finalizeError) throw finalizeError;

    await supabaseAdmin
      .from("business_website_versions")
      .update({ published_at: publishedAt })
      .eq("website_id", website.id)
      .eq("version", version);

    return NextResponse.json({ ok: true, website_id: website.id, version, node: allocation.node.name, current_path: result.currentPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : "website_publish_failed";
    if (websiteId) {
      await supabaseAdmin
        .from("business_websites")
        .update({
          editor_status: "failed",
          status: "failed",
          deployment_status: "failed",
          last_publish_status: "failed",
          last_error: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", websiteId);
    }
    const status = message === "no_healthy_hosting_capacity" ? 503 : 500;
    return NextResponse.json({ error: status === 503 ? "No healthy website hosting capacity is available right now." : "Unable to publish this website." }, { status });
  }
}
