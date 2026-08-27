import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  awsWebsiteHostingConfigured,
  getWebsiteHostingMode,
  rollbackAwsWebsiteRelease,
} from "@/lib/websites/aws-hosting-client";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";

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
  if (!Number.isInteger(requestedVersion) || requestedVersion < 1) {
    return NextResponse.json({ error: "Choose a valid website version." }, { status: 400 });
  }

  const hostingMode = getWebsiteHostingMode();
  if (hostingMode === "lightsail") {
    return NextResponse.json({
      error: "Release rollback is available after AWS S3/CloudFront hosting is enabled.",
      hosting_mode: hostingMode,
    }, { status: 409 });
  }
  if (!awsWebsiteHostingConfigured()) {
    return NextResponse.json({ error: "AWS website hosting is not configured." }, { status: 503 });
  }

  try {
    const location = await getAuthorizedWebsiteLocation(user, locationId, "id");
    if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

    const { data: website, error: websiteError } = await supabaseAdmin
      .from("business_websites")
      .select("id,domain,platform_domain,published_version")
      .eq("location_id", locationId)
      .maybeSingle();
    if (websiteError) throw websiteError;
    if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404 });

    const { data: versionRow, error: versionError } = await supabaseAdmin
      .from("business_website_versions")
      .select("version,published_at")
      .eq("website_id", website.id)
      .eq("version", requestedVersion)
      .maybeSingle();
    if (versionError) throw versionError;
    if (!versionRow) return NextResponse.json({ error: "That website version does not exist." }, { status: 404 });

    const domain = String(website.domain || website.platform_domain || "").trim().toLowerCase();
    if (!domain) return NextResponse.json({ error: "Website domain is not configured." }, { status: 409 });

    const result = await rollbackAwsWebsiteRelease({
      websiteId: website.id,
      domain,
      version: requestedVersion,
    });

    if (hostingMode === "cloudfront_s3") {
      const now = new Date().toISOString();
      const { error: updateError } = await supabaseAdmin
        .from("business_websites")
        .update({
          published_version: requestedVersion,
          deployment_version: String(requestedVersion),
          deployment_status: "deployed",
          last_publish_status: "published",
          last_deployed_at: now,
          last_error: null,
          updated_at: now,
        })
        .eq("id", website.id);
      if (updateError) throw updateError;
    }

    return NextResponse.json({
      ok: true,
      hosting_mode: hostingMode,
      live_changed: hostingMode === "cloudfront_s3",
      shadow_changed: hostingMode === "dual",
      website_id: website.id,
      previous_published_version: website.published_version,
      version: requestedVersion,
      aws_hosting: result,
    });
  } catch (error) {
    console.error("Website release rollback failed", {
      locationId,
      requestedVersion,
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json({ error: "Unable to roll back this website version." }, { status: 500 });
  }
}
