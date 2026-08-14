import crypto from "node:crypto";
import dns from "node:dns/promises";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDomainBenefitSettings } from "@/lib/domains/benefit-settings";
import { connectGeneratedSiteDomain } from "@/lib/domains/connect-generated-site";
import {
  getDomainGatewayStatus,
  getRegistrarDomainStatus,
  renewDomain,
} from "@/lib/domains/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH_SIZE = 25;
const REGISTRATION_RECONCILE_BATCH = 10;
const RENEWAL_BATCH = 10;
const HTTPS_TIMEOUT_MS = 8_000;
const NODE_HEALTH_MAX_AGE_MS = 10 * 60 * 1000;
const REGISTRATION_RECONCILE_AFTER_MS = 2 * 60 * 1000;
const RENEWAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type WebsiteRow = {
  id: string;
  hosting_node_id: string | null;
  dns_status: string;
  ssl_status: string;
  deployment_status: string;
  status: string;
};

type HostingNode = {
  id: string;
  name: string;
  ip: string;
  status: string;
  lastHealthCheckAt: string | null;
};

type LiveCheck =
  | { healthy: true; website: WebsiteRow; node: HostingNode }
  | { healthy: false; reason: "website_missing" }
  | { healthy: false; reason: "hosting_node_unhealthy"; website: WebsiteRow }
  | { healthy: false; reason: "dns_drift" | "https_unhealthy"; website: WebsiteRow; node: HostingNode };

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function cleanDomain(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function healthIsFresh(value: string | null) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now() - NODE_HEALTH_MAX_AGE_MS;
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

async function loadWebsite(locationId: string): Promise<WebsiteRow | null> {
  const { data, error } = await supabaseAdmin
    .from("business_websites")
    .select("id,hosting_node_id,dns_status,ssl_status,deployment_status,status")
    .eq("location_id", locationId)
    .maybeSingle();
  if (error) throw error;
  return data as WebsiteRow | null;
}

async function loadNode(hostingNodeId: string | null): Promise<HostingNode | null> {
  if (!hostingNodeId) return null;
  const { data, error } = await supabaseAdmin
    .from("website_hosting_nodes")
    .select("id,name,public_ip,status,last_health_check_at")
    .eq("id", hostingNodeId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.public_ip) return null;
  return {
    id: String(data.id),
    name: String(data.name || ""),
    ip: String(data.public_ip),
    status: String(data.status || "unknown"),
    lastHealthCheckAt: data.last_health_check_at ? String(data.last_health_check_at) : null,
  };
}

async function dnsPointsTo(domain: string, expectedIp: string) {
  try {
    return (await dns.resolve4(domain)).includes(expectedIp);
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

async function verifyLive(locationId: string, domain: string): Promise<LiveCheck> {
  const website = await loadWebsite(locationId);
  if (!website) return { healthy: false, reason: "website_missing" };

  const node = await loadNode(website.hosting_node_id);
  if (!node || node.status !== "healthy" || !healthIsFresh(node.lastHealthCheckAt)) {
    return { healthy: false, reason: "hosting_node_unhealthy", website };
  }
  if (!(await dnsPointsTo(domain, node.ip))) {
    return { healthy: false, reason: "dns_drift", website, node };
  }
  if (!(await httpsIsLive(domain))) {
    return { healthy: false, reason: "https_unhealthy", website, node };
  }
  return { healthy: true, website, node };
}

async function reconcileRegistrations() {
  const cutoff = new Date(Date.now() - REGISTRATION_RECONCILE_AFTER_MS).toISOString();
  const { data: operations, error } = await supabaseAdmin
    .from("domain_registration_operations")
    .select("id,location_id,domain_name,updated_at")
    .eq("status", "registering")
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(REGISTRATION_RECONCILE_BATCH);
  if (error) throw error;

  const results: Array<Record<string, unknown>> = [];
  for (const operation of operations || []) {
    const domain = cleanDomain(operation.domain_name);
    try {
      const registrar = await getRegistrarDomainStatus(domain);
      if (!registrar.active || registrar.sponsoringRsp !== "1") {
        results.push({ operationId: operation.id, domain, state: "waiting" });
        continue;
      }
      const { error: completeError } = await supabaseAdmin.rpc("complete_partner_pro_included_domain", {
        p_operation_id: operation.id,
        p_gateway_order_id: null,
        p_gateway_response_code: registrar.responseCode || "200",
        p_gateway_expiration_date: registrar.expirationDate || null,
      });
      if (completeError) throw completeError;
      await updateLocation(operation.location_id, {
        included_domain_connection_status: "pending",
        included_domain_verification_checked_at: null,
      });
      results.push({ operationId: operation.id, domain, state: "reconciled" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "registration_reconciliation_failed";
      await supabaseAdmin
        .from("domain_registration_operations")
        .update({ error_code: "registration_reconciliation_retry", updated_at: new Date().toISOString() })
        .eq("id", operation.id)
        .eq("status", "registering");
      results.push({ operationId: operation.id, domain, state: "retry", error: message });
    }
  }
  return results;
}

async function processEligibleRenewals() {
  const settings = await getDomainBenefitSettings();
  if (!settings.renewalIncluded) {
    return { policyEnabled: false, gatewayEnabled: false, results: [] as Array<Record<string, unknown>> };
  }

  const gateway = await getDomainGatewayStatus();
  if (gateway.renewalEnabled !== true) {
    return { policyEnabled: true, gatewayEnabled: false, results: [] as Array<Record<string, unknown>> };
  }

  const threshold = new Date(Date.now() + RENEWAL_WINDOW_MS).toISOString();
  const { data: locations, error } = await supabaseAdmin
    .from("locations")
    .select("id,included_domain_name,included_domain_renewal_due_at")
    .eq("included_domain_status", "active")
    .not("included_domain_name", "is", null)
    .not("included_domain_renewal_due_at", "is", null)
    .lte("included_domain_renewal_due_at", threshold)
    .order("included_domain_renewal_due_at", { ascending: true })
    .limit(RENEWAL_BATCH);
  if (error) throw error;

  const results: Array<Record<string, unknown>> = [];
  for (const location of locations || []) {
    const domain = cleanDomain(location.included_domain_name);
    try {
      const registrar = await getRegistrarDomainStatus(domain);
      const expiration = registrar.expirationDate ? new Date(registrar.expirationDate) : null;
      if (!expiration || !Number.isFinite(expiration.getTime())) {
        results.push({ locationId: location.id, domain, state: "missing_expiration" });
        continue;
      }
      if (expiration.getTime() > Date.now() + RENEWAL_WINDOW_MS) {
        await updateLocation(location.id, { included_domain_renewal_due_at: expiration.toISOString() });
        results.push({ locationId: location.id, domain, state: "not_due" });
        continue;
      }

      const expirationYear = expiration.getUTCFullYear();
      const idempotencyKey = `toh-renew-${crypto
        .createHash("sha256")
        .update(`${location.id}:${domain}:${expirationYear}`)
        .digest("hex")
        .slice(0, 40)}`;
      const renewal = await renewDomain(domain, expirationYear, idempotencyKey);
      if (renewal.expirationDate) {
        await updateLocation(location.id, {
          included_domain_renewal_due_at: renewal.expirationDate,
          included_domain_status: "active",
        });
      }
      results.push({ locationId: location.id, domain, state: renewal.status, expirationDate: renewal.expirationDate });
    } catch (error) {
      results.push({
        locationId: location.id,
        domain,
        state: "retry",
        error: error instanceof Error ? error.message : "renewal_failed",
      });
    }
  }
  return { policyEnabled: true, gatewayEnabled: true, results };
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
  if (String(location.included_domain_connection_status || "").toLowerCase() === "live") {
    const live = await verifyLive(location.id, domain);
    if (live.healthy) {
      await updateWebsite(live.website.id, { last_health_check_at: now, last_error: null });
      await updateLocation(location.id, { included_domain_verification_checked_at: now });
      return { locationId: location.id, domain, state: "live" };
    }

    if (live.reason === "website_missing" || live.reason === "hosting_node_unhealthy") {
      if (live.reason === "hosting_node_unhealthy") {
        await updateWebsite(live.website.id, { status: "provisioning", last_error: live.reason });
      }
      await updateLocation(location.id, {
        included_domain_connection_status: "host_recovery",
        included_domain_verification_checked_at: now,
      });
      return { locationId: location.id, domain, state: "host_recovery", reason: live.reason };
    }

    if (live.reason === "dns_drift") {
      await updateWebsite(live.website.id, { dns_status: "pending", ssl_status: "pending", last_error: "dns_drift" });
      await updateLocation(location.id, { included_domain_connection_status: "dns_retry" });
    } else {
      await updateWebsite(live.website.id, { ssl_status: "pending", last_error: "https_unhealthy" });
      await updateLocation(location.id, { included_domain_connection_status: "ssl_retry" });
    }
  }

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
    const state = message === "hosting_node_unavailable" || message === "no_healthy_hosting_capacity"
      ? "host_recovery"
      : "dns_retry";
    await updateLocation(location.id, {
      included_domain_connection_status: state,
      included_domain_verification_checked_at: now,
    });
    return { locationId: location.id, domain, state, error: message };
  }

  const website = await loadWebsite(location.id);
  if (!website) throw new Error("website_missing_after_connection");
  const node = await loadNode(website.hosting_node_id);
  if (!node || node.status !== "healthy" || !healthIsFresh(node.lastHealthCheckAt)) {
    await updateWebsite(website.id, { dns_status: "pending", last_error: "hosting_node_unavailable" });
    await updateLocation(location.id, {
      included_domain_connection_status: "host_recovery",
      included_domain_verification_checked_at: now,
    });
    return { locationId: location.id, domain, state: "host_recovery" };
  }

  if (!(await dnsPointsTo(domain, node.ip))) {
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

  if (!(await httpsIsLive(domain))) {
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
  return { locationId: location.id, domain, state: "live", websiteId: connected.websiteId };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const registrationReconciliation = await reconcileRegistrations().catch((error) => {
    console.error("Registration reconciliation batch failed", error);
    return [{ state: "batch_error", error: error instanceof Error ? error.message : "registration_reconciliation_failed" }];
  });
  const renewals = await processEligibleRenewals().catch((error) => {
    console.error("Domain renewal batch failed", error);
    return {
      policyEnabled: false,
      gatewayEnabled: false,
      results: [{ state: "batch_error", error: error instanceof Error ? error.message : "renewal_batch_failed" }],
    };
  });

  const { data: locations, error } = await supabaseAdmin
    .from("locations")
    .select("id,included_domain_name,included_domain_status,included_domain_connection_status")
    .eq("included_domain_status", "active")
    .not("included_domain_name", "is", null)
    .order("included_domain_verification_checked_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("Domain lifecycle queue lookup failed", error);
    return NextResponse.json({ ok: false, error: "Unable to load domain lifecycle queue." }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const location of locations || []) {
    try {
      results.push(await advanceDomain(location));
    } catch (error) {
      results.push({
        locationId: location.id,
        domain: cleanDomain(location.included_domain_name),
        state: "error",
        error: error instanceof Error ? error.message : "unexpected_domain_lifecycle_error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    registrationReconciliation,
    renewals,
    processed: results.length,
    live: results.filter((item) => item.state === "live").length,
    retrying: results.filter((item) => ["dns_retry", "awaiting_dns", "ssl_retry", "host_recovery"].includes(String(item.state))).length,
    results,
  });
}
