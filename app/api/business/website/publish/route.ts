import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { allocateLightsailWebsiteNode } from "@/lib/hosting/lightsail-nodes";
import { replicateWebsiteToStandby } from "@/lib/hosting/website-replication";
import { deployWebsiteArtifact } from "@/lib/websites/deploy-client";
import { renderEnhancedWebsiteArtifact } from "@/lib/websites/content-artifact";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";
import { buildPlatformWebsiteDomain } from "@/lib/websites/platform-domain";
import { getGeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";
import type { BusinessWebsite } from "@/lib/websites/data";

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function ensurePlatformDomain(websiteId: string, locationName: string | null) {
  const { data: current, error: currentError } = await supabaseAdmin
    .from("business_websites")
    .select("id,platform_domain")
    .eq("id", websiteId)
    .single();
  if (currentError) throw currentError;
  if (current.platform_domain) return String(current.platform_domain).trim().toLowerCase();

  for (let sequence = 0; sequence < 1000; sequence += 1) {
    const candidate = buildPlatformWebsiteDomain(locationName, websiteId, sequence);
    const { data, error } = await supabaseAdmin
      .from("business_websites")
      .update({ platform_domain: candidate, updated_at: new Date().toISOString() })
      .eq("id", websiteId)
      .is("platform_domain", null)
      .select("platform_domain")
      .maybeSingle();

    if (!error && data?.platform_domain) return String(data.platform_domain);
    if (error && String((error as { code?: string }).code || "") !== "23505") throw error;

    const { data: refreshed, error: refreshedError } = await supabaseAdmin
      .from("business_websites")
      .select("platform_domain")
      .eq("id", websiteId)
      .single();
    if (refreshedError) throw refreshedError;
    if (refreshed.platform_domain) return String(refreshed.platform_domain);
  }

  throw new Error("platform_domain_exhausted");
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
    const renderLocation = await getGeneratedWebsiteLocationSnapshot(locationRecord);

    const { data: websiteRow, error: websiteError } = await supabaseAdmin
      .from("business_websites")
      .select("*")
      .eq("location_id", locationId)
      .maybeSingle();
    if (websiteError) throw websiteError;
    if (!websiteRow) return NextResponse.json({ error: "Create the website draft before publishing." }, { status: 409 });

    websiteId = websiteRow.id;
    const platformLocationName = renderLocation.name || renderLocation.title || websiteRow.site_title || null;
    const platformDomain = await ensurePlatformDomain(websiteRow.id, platformLocationName);
    const publishDomain = websiteRow.domain?.trim().toLowerCase() || platformDomain;

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
        platform_domain: platformDomain,
      },
      location: locationRecord,
      rendered_live_content: renderLocation,
    };

    const { error: snapshotError } = await supabaseAdmin.from("business_website_versions").insert({
      website_id: website.id,
      version,
      snapshot,
      source: "publish",
      created_by: user.id,
    });
    if (snapshotError) throw snapshotError;

    const files = renderEnhancedWebsiteArtifact(website, renderLocation);
    const deployInput = {
      websiteId: website.id,
      locationId,
      version,
      sitePath: allocation.website.site_path || `/srv/sites/${locationId}`,
      domain: publishDomain,
      files,
    };
    const result = await deployWebsiteArtifact(deployInput);

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

    let standby: { node: string; version: number; status: "synced" | "pending_repair" } | null = null;
    try {
      const replica = await replicateWebsiteToStandby(deployInput, allocation.node.id);
      standby = { node: replica.node.name, version: replica.version, status: "synced" };
    } catch (replicationError) {
      console.error("Website standby replication failed", {
        websiteId: website.id,
        version,
        error: replicationError instanceof Error ? replicationError.message : replicationError,
      });
      standby = { node: "unassigned", version, status: "pending_repair" };
    }

    return NextResponse.json({
      ok: true,
      website_id: website.id,
      version,
      node: allocation.node.name,
      current_path: result.currentPath,
      standby,
      platform_domain: platformDomain,
      live_domain: publishDomain,
      live_url: `https://${publishDomain}`,
    });
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
