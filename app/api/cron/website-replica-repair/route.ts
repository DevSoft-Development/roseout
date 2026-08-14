import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { replicateWebsiteToStandby } from "@/lib/hosting/website-replication";
import { renderWebsiteArtifact } from "@/lib/websites/static-renderer";
import type { BusinessWebsite } from "@/lib/websites/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH_SIZE = 10;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: websites, error } = await supabaseAdmin
    .from("business_websites")
    .select("*")
    .eq("status", "live")
    .not("hosting_node_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) return NextResponse.json({ ok: false, error: "Unable to load websites." }, { status: 500 });

  const results: Array<Record<string, unknown>> = [];
  for (const websiteRow of websites || []) {
    const version = Number(websiteRow.published_version || websiteRow.deployment_version || 0);
    if (!Number.isInteger(version) || version < 1) continue;

    const { data: existingReplica } = await supabaseAdmin
      .from("website_hosting_replicas")
      .select("version,status")
      .eq("website_id", websiteRow.id)
      .eq("version", version)
      .eq("status", "synced")
      .limit(1)
      .maybeSingle();
    if (existingReplica) {
      results.push({ websiteId: websiteRow.id, state: "already_synced", version });
      continue;
    }

    const { data: location, error: locationError } = await supabaseAdmin
      .from("locations")
      .select("id,name,title,address,phone,hours,reservation_link,image_url")
      .eq("id", websiteRow.location_id)
      .maybeSingle();
    if (locationError || !location) {
      results.push({ websiteId: websiteRow.id, state: "location_missing" });
      continue;
    }

    const website = websiteRow as BusinessWebsite;
    const files = renderWebsiteArtifact(website, {
      id: String(location.id),
      name: nullableString(location.name),
      title: nullableString(location.title),
      address: nullableString(location.address),
      phone: nullableString(location.phone),
      hours: nullableString(location.hours),
      reservation_link: nullableString(location.reservation_link),
      image_url: nullableString(location.image_url),
    });
    const domain = String(websiteRow.domain || websiteRow.platform_domain || "").trim().toLowerCase();
    if (!domain) {
      results.push({ websiteId: websiteRow.id, state: "domain_missing" });
      continue;
    }

    try {
      const replica = await replicateWebsiteToStandby({
        websiteId: String(websiteRow.id),
        locationId: String(websiteRow.location_id),
        version,
        sitePath: String(websiteRow.site_path || `/srv/sites/${websiteRow.location_id}`),
        domain,
        files,
      }, String(websiteRow.hosting_node_id));
      results.push({ websiteId: websiteRow.id, state: "repaired", node: replica.node.name, version });
    } catch (repairError) {
      results.push({
        websiteId: websiteRow.id,
        state: "repair_retry",
        error: repairError instanceof Error ? repairError.message : "website_replica_repair_failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    repaired: results.filter((item) => item.state === "repaired").length,
    retrying: results.filter((item) => item.state === "repair_retry").length,
    results,
  });
}
