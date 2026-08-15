import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

type HeartbeatPayload = {
  name: string;
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  caddyStatus?: string;
  certbotTimerStatus?: string;
  tlsStatus?: string;
  tlsWildcard?: boolean;
  tlsCertSubject?: string;
  tlsCertExpiresAt?: string;
  tlsLastCheckedAt?: string;
  certLastRenewedAt?: string;
};

function getHeartbeatSecret() {
  const value = process.env.WEBSITE_NODE_HEARTBEAT_SECRET?.trim();
  if (!value) throw new Error("website_node_heartbeat_not_configured");
  return value;
}

function validMetric(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function optionalStatus(value: unknown, allowed: string[]) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : null;
}

function optionalDate(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function optionalText(value: unknown, maxLength = 240) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  return value.trim().slice(0, maxLength);
}

function verifySignature(timestamp: string, body: string, signature: string) {
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed) || Math.abs(Date.now() - parsed) > MAX_CLOCK_SKEW_MS) return false;
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;

  const expected = createHmac("sha256", getHeartbeatSecret()).update(`${timestamp}.${body}`).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

export async function POST(request: Request) {
  const body = await request.text();
  const timestamp = request.headers.get("x-toh-timestamp") || "";
  const signature = request.headers.get("x-toh-signature") || "";

  try {
    if (!verifySignature(timestamp, body, signature)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "heartbeat_not_configured" }, { status: 503 });
  }

  const payload = JSON.parse(body || "{}") as Partial<HeartbeatPayload>;
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(name)) {
    return NextResponse.json({ ok: false, error: "invalid_node" }, { status: 400 });
  }
  if (!validMetric(payload.cpuPercent) || !validMetric(payload.memoryPercent) || !validMetric(payload.diskPercent)) {
    return NextResponse.json({ ok: false, error: "invalid_metrics" }, { status: 400 });
  }

  const caddyStatus = optionalStatus(payload.caddyStatus, ["active", "inactive", "failed", "unknown"]);
  const certbotTimerStatus = optionalStatus(payload.certbotTimerStatus, ["active", "inactive", "failed", "missing", "unknown"]);
  const tlsStatus = optionalStatus(payload.tlsStatus, ["healthy", "expiring", "expired", "missing", "invalid", "unknown"]);
  const tlsCertExpiresAt = optionalDate(payload.tlsCertExpiresAt);
  const tlsLastCheckedAt = optionalDate(payload.tlsLastCheckedAt);
  const certLastRenewedAt = optionalDate(payload.certLastRenewedAt);
  const tlsCertSubject = optionalText(payload.tlsCertSubject);

  if ([caddyStatus, certbotTimerStatus, tlsStatus, tlsCertExpiresAt, tlsLastCheckedAt, certLastRenewedAt, tlsCertSubject].includes(null)) {
    return NextResponse.json({ ok: false, error: "invalid_tls_telemetry" }, { status: 400 });
  }
  if (payload.tlsWildcard !== undefined && typeof payload.tlsWildcard !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid_tls_telemetry" }, { status: 400 });
  }

  const { data: node, error: readError } = await supabaseAdmin
    .from("website_hosting_nodes")
    .select("id,status,healthy_since")
    .eq("name", name)
    .maybeSingle();

  if (readError) return NextResponse.json({ ok: false, error: "heartbeat_read_failed" }, { status: 500 });
  if (!node) return NextResponse.json({ ok: false, error: "unknown_node" }, { status: 404 });

  const degraded = payload.cpuPercent >= 95 || payload.memoryPercent >= 90 || payload.diskPercent >= 90;
  const nextStatus = node.status === "maintenance" ? "maintenance" : degraded ? "degraded" : "healthy";
  const now = new Date().toISOString();
  const healthySince = nextStatus === "healthy"
    ? (node.status === "healthy" && node.healthy_since ? node.healthy_since : now)
    : null;

  const telemetry: Record<string, unknown> = {};
  if (caddyStatus !== undefined) telemetry.caddy_status = caddyStatus;
  if (certbotTimerStatus !== undefined) telemetry.certbot_timer_status = certbotTimerStatus;
  if (tlsStatus !== undefined) telemetry.tls_status = tlsStatus;
  if (payload.tlsWildcard !== undefined) telemetry.tls_wildcard = payload.tlsWildcard;
  if (tlsCertSubject !== undefined) telemetry.tls_cert_subject = tlsCertSubject;
  if (tlsCertExpiresAt !== undefined) telemetry.tls_cert_expires_at = tlsCertExpiresAt;
  if (tlsLastCheckedAt !== undefined) telemetry.tls_last_checked_at = tlsLastCheckedAt;
  if (certLastRenewedAt !== undefined) telemetry.cert_last_renewed_at = certLastRenewedAt;

  const { error: updateError } = await supabaseAdmin
    .from("website_hosting_nodes")
    .update({
      status: nextStatus,
      healthy_since: healthySince,
      cpu_percent: payload.cpuPercent,
      memory_percent: payload.memoryPercent,
      disk_percent: payload.diskPercent,
      last_health_check_at: now,
      updated_at: now,
      ...telemetry,
    })
    .eq("id", node.id);

  if (updateError) return NextResponse.json({ ok: false, error: "heartbeat_update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, status: nextStatus, healthySince, receivedAt: now });
}
