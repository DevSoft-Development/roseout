import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { allocateLightsailWebsiteNode } from "@/lib/hosting/lightsail-nodes";
import { recordWebsiteReplicaSynced, replicateWebsiteToStandby } from "@/lib/hosting/website-replication";
import {
  awsWebsiteHostingConfigured,
  getWebsiteHostingMode,
  rollbackAwsWebsiteRelease,
} from "@/lib/websites/aws-hosting-client";
import { deployWebsiteArtifact } from "@/lib/websites/deploy-client";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";
import { getGeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";
import { renderEnhancedWebsiteArtifact } from "@/lib/websites/content-artifact";
import { getMigrationRedirectRules } from "@/lib/websites/migration-redirect-artifact";
import type { BusinessWebsite } from "@/lib/websites/data";

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const locationId = String(body?.location_id || "").trim();
  const requestedVersion = Number(body?.version);
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });
  if (!Number.isInteger(requestedVersion) || requestedVersion < 1) return NextResponse.json({ error: "Choose a valid website version." }, { status: 400 });

  try {
    const hostingMode = getWebsiteHostingMode();
    const location = await getAuthorizedWebsiteLocation(user, locationId, "*");
    if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });
    const { data: website, error: websiteError } = await supabaseAdmin.from("business_websites").select("*").eq("location_id", locationId).maybeSingle();
    if (websiteError) throw websiteError;
    if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404 });
    const { data: versionRow, error: versionError } = await supabaseAdmin.from("business_website_versions").select("version,snapshot,published_at").eq("website_id", website.id).eq("version", requestedVersion).maybeSingle();
    if (versionError) throw versionError;
    if (!versionRow) return NextResponse.json({ error: "That website version does not exist." }, { status: 404 });
    const domain = String(website.domain || website.platform_domain || "").trim().toLowerCase();
    if (!domain) return NextResponse.json({ error: "Website domain is not configured." }, { status: 409 });

    if (hostingMode !== "lightsail") {
      if (!awsWebsiteHostingConfigured()) return NextResponse.json({ error: "AWS website hosting is not configured." }, { status: 503 });
      const result = await rollbackAwsWebsiteRelease({ websiteId: website.id, domain, version: requestedVersion });
      if (hostingMode === "cloudfront_s3") {
        const now = new Date().toISOString();
        await supabaseAdmin.from("business_websites").update({ published_version: requestedVersion, deployment_version: String(requestedVersion), deployment_status: "deployed", last_publish_status: "published", last_deployed_at: now, last_error: null, updated_at: now }).eq("id", website.id);
      }
      return NextResponse.json({ ok: true, hosting_mode: hostingMode, restored_from_version: requestedVersion, version: requestedVersion, aws_hosting: result });
    }

    const snapshot = (versionRow.snapshot && typeof versionRow.snapshot === "object" ? versionRow.snapshot : {}) as Record<string, any>;
    const savedWebsite = snapshot.website && typeof snapshot.website === "object" ? snapshot.website : {};
    const restoredWebsite: BusinessWebsite = { ...(website as BusinessWebsite), site_title: savedWebsite.site_title ?? website.site_title, theme: savedWebsite.theme ?? website.theme, sections: savedWebsite.sections ?? website.sections, custom_content: savedWebsite.custom_content ?? website.custom_content };
    const liveContent = await getGeneratedWebsiteLocationSnapshot(location as Record<string, unknown>);
    const files = renderEnhancedWebsiteArtifact(restoredWebsite, liveContent);
    const redirects = getMigrationRedirectRules(restoredWebsite);
    const { data: latest } = await supabaseAdmin.from("business_website_versions").select("version").eq("website_id", website.id).order("version", { ascending: false }).limit(1).maybeSingle();
    const newVersion = Number(latest?.version || 0) + 1;
    const allocation = await allocateLightsailWebsiteNode(locationId, website.domain || null);
    const deployInput = { websiteId: website.id, locationId, version: newVersion, sitePath: allocation.website.site_path || `/srv/sites/${locationId}`, domain, files, redirects };
    await deployWebsiteArtifact(deployInput);
    await recordWebsiteReplicaSynced(website.id, allocation.node.id, newVersion);
    try { await replicateWebsiteToStandby(deployInput, allocation.node.id); } catch (error) { console.error("Website rollback standby replication failed", { websiteId: website.id, newVersion, error }); }
    const now = new Date().toISOString();
    await supabaseAdmin.from("business_website_versions").insert({ website_id: website.id, version: newVersion, snapshot: { website: savedWebsite, location, rendered_live_content: liveContent, restored_from_version: requestedVersion }, source: "rollback", created_by: user.id, published_at: now });
    await supabaseAdmin.from("business_websites").update({ site_title: restoredWebsite.site_title, theme: restoredWebsite.theme, sections: restoredWebsite.sections, custom_content: restoredWebsite.custom_content, published_version: newVersion, deployment_version: String(newVersion), deployment_status: "deployed", last_publish_status: "published", last_deployed_at: now, published_at: now, last_error: null, updated_at: now }).eq("id", website.id);
    return NextResponse.json({ ok: true, hosting_mode: hostingMode, restored_from_version: requestedVersion, version: newVersion, live_changed: true, redirects: redirects.length });
  } catch (error) {
    console.error("Website release rollback failed", { locationId, requestedVersion, error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: "Unable to roll back this website version." }, { status: 500 });
  }
}
