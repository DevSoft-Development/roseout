import dns from "node:dns/promises";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { connectGeneratedSiteDomain } from "@/lib/domains/connect-generated-site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH_SIZE = 25;
const HTTPS_TIMEOUT_MS = 8_000;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function cleanDomain(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function expectedNodeIp(hostingNodeId: string | null) {
  if (!hostingNodeId) return null;
  const { data } = await supabaseAdmin
    .from("website_hosting_nodes")
    .select("public_ip,status,last_health_check_at")
    .eq("id", hostingNodeId)
    .maybeSingle();
  if (!data?.public_ip) return null;
  return {
    ip: String(data.public_ip),
    status: String(data.status || "unknown"),
    lastHealthCheckAt: data.last_health_check_at ? String(data.last_health_check_at) : null,
  };
}

async function dnsPointsTo(domain: string, expectedIp: string) {
  try {
    const addresses = await dns.resolve4(domain);
    return addresses.includes(expectedIp);
  } catch {
    return false;
  }
}

async function httpsIsLive(domain: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTPS_TIMEOUT_MS);
  try {
    const response = await fetch(`https://${domain}/`, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: { "user-agent": "TheOutHaven-Domain-Lifecycle/1.0" },
    });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function updateLocation(locationId: string, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from("locations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", locationId);
  if (error) throw error;
}

async function updateWebsite(websiteId: string, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from("business_websites")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", websiteId);
  if (error) throw error;
}

async function advanceDomain(location: {
  id: string;
  included_domain_name: string | null;
  included_domain_status: string | null;
  included_domain_connection_status: string | null;
}) {
  const domain = cleanDomain(location.included_domain_name);
  if (!domain || String(location.included_domain_status || "").toLowerCase() !== "active") {
    return { locationId: location.id, domain, state: "skipped" };
  }

  const now = new Date().toISOString();
  await updateLocation(location.id, {
    included_domain_connection_status: "configuring_dns",
    included_domain_verification_checked_at: now,
  });

  let connected;
  try {
    connected = await connectGeneratedSiteDomain(location.id, domain);
    await updateLocation(location.id, {
      included_domain_connection_status: "awaiting_dns",
      included_domain_dns_configured_at: now,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "domain_connection_failed";
    await updateLocation(location.id, {
      included_domain_connection_status: "dns_retry",
      included_domain_verification_checked_at: now,
    });
    return { locationId: location.id, domain, state: "dns_retry", error: message };
  }

  const { data: website, error: websiteError } = await supabaseAdmin
    .from("business_websites")
    .select("id,hosting_node_id,dns_status,ssl_status,deployment_status,status")
    .eq("id", connected.websiteId)
    .single();
  if (websiteError) throw websiteError;

  const node = await expectedNodeIp(website.hosting_node_id);
  if (!node?.ip) {
    await updateWebsite(website.id, { dns_status: "pending", last_error: "hosting_node_unavailable" });
    await updateLocation(location.id, {
      included_domain_connection_status: "host_recovery",
      included_domain_verification_checked_at: now,
    });
    return { locationId: location.id, domain, state: "host_recovery" };
  }

  const dnsLive = await dnsPointsTo(domain, node.ip);
  if (!dnsLive) {
    await updateWebsite(website.id, { dns_status: "propagating", ssl_status: "pending", last_error: null });
    await updateLocation(location.id, {
      included_domain_connection_status: "awaiting_dns",
      included_domain_verification_checked_at: now,
    });
    return { locationId: location.id, domain, state: "awaiting_dns" };
  }

  await updateWebsite(website.id, { dns_status: "verified", ssl_status: "provisioning", last_error: null });
  await updateLocation(location.id, {
    included_domain_connection_status: "provisioning_ssl",
    included_domain_verification_checked_at: now,
  });

  const httpsLive = await httpsIsLive(domain);
  if (!httpsLive) {
    await updateWebsite(website.id, { ssl_status: "pending", last_error: "https_not_ready" });
    await updateLocation(location.id, {
      included_domain_connection_status: "ssl_retry",
      included_domain_verification_checked_at: now,
    });
    return { locationId: location.id, domain, state: "ssl_retry" };
  }

  await updateWebsite(website.id, {
    dns_status: "verified",
    ssl_status: "active",
    status: "live",
    last_health_check_at: now,
    last_error: null,
  });
  await updateLocation(location.id, {
    included_domain_connection_status: "live",
    included_domain_verification_checked_at: now,
    included_domain_connected_at: now,
  });

  return { locationId: location.id, domain, state: "live" };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: locations, error } = await supabaseAdmin
    .from("locations")
    .select("id,included_domain_name,included_domain_status,included_domain_connection_status")
    .eq("included_domain_status", "active")
    .not("included_domain_name", "is", null)
    .neq("included_domain_connection_status", "live")
    .order("included_domain_verification_checked_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("Domain lifecycle queue lookup failed", error);
    return NextResponse.json({ ok: false, error: "Unable to load domain lifecycle queue." }, { status: 500 });
  }

  const results = [];
  for (const location of locations || []) {
    try {
      results.push(await advanceDomain(location));
    } catch (error) {
      const message = error instanceof Error ? error.message : "unexpected_domain_lifecycle_error";
      console.error("Domain lifecycle advance failed", { locationId: location.id, error });
      results.push({ locationId: location.id, domain: cleanDomain(location.included_domain_name), state: "error", error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    live: results.filter((item) => item.state === "live").length,
    retrying: results.filter((item) => ["dns_retry", "awaiting_dns", "ssl_retry", "host_recovery"].includes(item.state)).length,
    results,
  });
}
