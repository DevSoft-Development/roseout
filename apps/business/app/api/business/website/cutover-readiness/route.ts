import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";
import { assertPublicWebsiteUrl } from "@/lib/websites/import-crawler";

export const runtime = "nodejs";

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function probe(url: string) {
  const started = Date.now();
  try {
    const safe = await assertPublicWebsiteUrl(url);
    const response = await fetch(safe, { method: "HEAD", redirect: "manual", headers: { "user-agent": "TheOutHaven Domain Cutover/1.1" }, signal: AbortSignal.timeout(8000) });
    return { ok: response.status >= 200 && response.status < 500, status: response.status, ms: Date.now() - started, location: response.headers.get("location") };
  } catch (error) {
    return { ok: false, status: null, ms: Date.now() - started, location: null, error: error instanceof Error ? error.message : "probe_failed" };
  }
}

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
  const locationId = new URL(request.url).searchParams.get("location_id")?.trim() || "";
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });
  const location = await getAuthorizedWebsiteLocation(user, locationId, "id");
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const { data: website, error } = await supabaseAdmin
    .from("business_websites")
    .select("id,domain,platform_domain,published_version,dns_status,ssl_status,last_publish_status,last_error,custom_content")
    .eq("location_id", locationId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load website domain status." }, { status: 500 });
  if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404 });

  const customDomain = String(website.domain || "").trim().toLowerCase();
  const platformDomain = String(website.platform_domain || "").trim().toLowerCase();
  const selectedDomain = customDomain || platformDomain;
  const domainMode = customDomain ? "custom" : "subdomain";

  if (!selectedDomain) {
    return NextResponse.json({
      ok: true,
      ready: false,
      domain: null,
      domain_mode: domainMode,
      checks: [{ key: "address", label: "Website address assigned", ok: false, detail: "Publish once to assign your included TheOutHaven subdomain." }],
      blocking: ["address"],
    });
  }

  const migrationImport = (website.custom_content as any)?.website_import;
  const migrationManifest = migrationImport?.migration_manifest;
  const redirectCount = Array.isArray(migrationManifest?.redirect_map) ? migrationManifest.redirect_map.length : 0;
  const reviewRequired = Boolean(migrationImport);
  const reviewApproved = !reviewRequired || migrationImport?.review_status === "approved";

  const sitemapProbe = await probe(`https://${selectedDomain}/sitemap.xml`);
  const robotsProbe = await probe(`https://${selectedDomain}/robots.txt`);
  const siteProbe = await probe(`https://${selectedDomain}/`);

  const checks: Array<{ key: string; label: string; ok: boolean; detail: string }> = [
    { key: "published", label: "Website version published", ok: Boolean(website.published_version), detail: website.published_version ? `Version ${website.published_version}` : "Publish a version before going live." },
    { key: "migration_review", label: "Migration review approved", ok: reviewApproved, detail: reviewRequired ? (migrationImport?.review_status === "approved" ? "Approved" : "Review imported pages and redirects before publishing.") : "No imported website detected" },
    { key: "site", label: domainMode === "subdomain" ? "TheOutHaven subdomain responds" : "Custom domain responds", ok: siteProbe.ok, detail: siteProbe.status ? `HTTP ${siteProbe.status} · ${siteProbe.ms} ms` : "Not reachable yet" },
    { key: "sitemap", label: "Sitemap available", ok: sitemapProbe.ok && sitemapProbe.status === 200, detail: sitemapProbe.status ? `HTTP ${sitemapProbe.status}` : "Not reachable yet" },
    { key: "robots", label: "robots.txt available", ok: robotsProbe.ok && robotsProbe.status === 200, detail: robotsProbe.status ? `HTTP ${robotsProbe.status}` : "Not reachable yet" },
    { key: "redirects", label: "Migration redirect plan ready", ok: redirectCount > 0 || !migrationManifest, detail: migrationManifest ? `${redirectCount} source paths mapped` : "No imported website detected" },
    { key: "publish_status", label: "Last publish healthy", ok: !website.last_error && String(website.last_publish_status || "").toLowerCase() !== "failed", detail: website.last_error || String(website.last_publish_status || "ready") },
  ];

  if (domainMode === "custom") {
    const apex = customDomain.replace(/^www\./, "");
    const www = `www.${apex}`;
    const [apexProbe, wwwProbe] = await Promise.all([probe(`https://${apex}`), probe(`https://${www}`)]);
    checks.splice(2, 0,
      { key: "dns", label: "DNS verified", ok: ["verified", "configured", "active"].includes(String(website.dns_status || "").toLowerCase()), detail: String(website.dns_status || "pending") },
      { key: "ssl", label: "SSL active", ok: String(website.ssl_status || "").toLowerCase() === "active", detail: String(website.ssl_status || "pending") },
      { key: "apex", label: "Apex domain responds", ok: apexProbe.ok, detail: apexProbe.status ? `HTTP ${apexProbe.status} · ${apexProbe.ms} ms` : "Not reachable yet" },
      { key: "www", label: "www domain responds or redirects", ok: wwwProbe.ok || Boolean(wwwProbe.location), detail: wwwProbe.status ? `HTTP ${wwwProbe.status} · ${wwwProbe.ms} ms` : "Not reachable yet" },
    );
  }

  const blockingKeys = domainMode === "custom"
    ? ["published", "migration_review", "dns", "ssl", "apex", "site", "sitemap", "robots", "publish_status"]
    : ["published", "migration_review", "site", "sitemap", "robots", "publish_status"];
  const blocking = checks.filter((check) => blockingKeys.includes(check.key) && !check.ok);

  return NextResponse.json({
    ok: true,
    ready: blocking.length === 0,
    domain: selectedDomain,
    domain_mode: domainMode,
    redirect_count: redirectCount,
    checks,
    blocking: blocking.map((check) => check.key),
  });
}
