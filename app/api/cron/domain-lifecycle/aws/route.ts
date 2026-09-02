import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDomainBenefitSettings } from "@/lib/domains/benefit-settings";
import {
  getDomainGatewayStatus,
  getRegistrarDomainStatus,
  renewDomain,
} from "@/lib/domains/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REGISTRATION_RECONCILE_BATCH = 10;
const RENEWAL_BATCH = 10;
const REGISTRATION_RECONCILE_AFTER_MS = 2 * 60 * 1000;
const RENEWAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const AWS_BACKGROUND_ORIGIN = "http://127.0.0.1:3000";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function cleanDomain(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function isPrivateAwsRequest(request: NextRequest) {
  return (
    request.headers.get("x-toh-aws-internal") === "managed-dispatch" ||
    String(process.env.PLATFORM_RUNTIME_PROVIDER || "").trim() === "aws-background"
  );
}

async function updateLocation(locationId: string, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from("locations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", locationId);
  if (error) throw error;
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

async function runBaseLifecycle(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) throw new Error("CRON_SECRET is not configured.");
  const privateAws = isPrivateAwsRequest(request);
  const origin = privateAws ? AWS_BACKGROUND_ORIGIN : request.nextUrl.origin;
  const target = new URL("/api/cron/domain-lifecycle", origin);
  const headers: Record<string, string> = {
    authorization: `Bearer ${secret}`,
    "x-cron-secret": secret,
  };
  if (privateAws) headers["x-toh-aws-internal"] = "managed-dispatch";
  const response = await fetch(target, {
    method: "GET",
    headers,
    cache: "no-store",
    redirect: privateAws ? "manual" : "follow",
  });
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("json")) {
    throw new Error(`Base domain lifecycle returned non-JSON HTTP ${response.status}.`);
  }
  const payload = await response.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Base domain lifecycle returned an invalid payload.");
  }
  return { response, payload: payload as Record<string, unknown> };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const privateAws = isPrivateAwsRequest(request);
  if (!privateAws) {
    try {
      const base = await runBaseLifecycle(request);
      return NextResponse.json(base.payload, { status: base.response.status });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "domain_lifecycle_proxy_failed" },
        { status: 502 },
      );
    }
  }

  const registrationReconciliation = await reconcileRegistrations().catch((error) => {
    console.error("AWS registration reconciliation batch failed", error);
    return [{ state: "batch_error", error: error instanceof Error ? error.message : "registration_reconciliation_failed" }];
  });
  const renewals = await processEligibleRenewals().catch((error) => {
    console.error("AWS domain renewal batch failed", error);
    return {
      policyEnabled: false,
      gatewayEnabled: false,
      results: [{ state: "batch_error", error: error instanceof Error ? error.message : "renewal_batch_failed" }],
    };
  });

  try {
    const base = await runBaseLifecycle(request);
    if (!base.response.ok || base.payload.ok === false) {
      return NextResponse.json(
        { ...base.payload, registrar_execution_runtime: "aws-background", registrar_executed_here: true },
        { status: base.response.status || 502 },
      );
    }
    return NextResponse.json(
      {
        ...base.payload,
        registrar_lifecycle_owner: "aws",
        registrar_execution_runtime: "aws-background",
        registrar_executed_here: true,
        registrationReconciliation,
        renewals,
      },
      { status: base.response.status },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        registrar_lifecycle_owner: "aws",
        registrar_execution_runtime: "aws-background",
        registrar_executed_here: true,
        registrationReconciliation,
        renewals,
        error: error instanceof Error ? error.message : "aws_domain_lifecycle_failed",
      },
      { status: 502 },
    );
  }
}
