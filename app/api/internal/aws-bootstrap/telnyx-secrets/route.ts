import { constants, createHmac, publicEncrypt, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 8_000;
const MAX_KEY_BYTES = 180;
const ROUTE_PATH = "/api/internal/aws-bootstrap/telnyx-secrets";

type ChannelName = "concierge" | "crm" | "reservations" | "support" | "marketing";

function bootstrapSecret() {
  return String(
    process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET
      || process.env.AWS_PLATFORM_INTEGRATION_API_SECRET
      || "",
  ).trim();
}

function authenticated(request: Request, body: string) {
  const secret = bootstrapSecret();
  if (secret.length < 32) return false;

  const timestamp = request.headers.get("x-toh-timestamp") || "";
  const signature = request.headers.get("x-toh-signature") || "";
  const epochMs = Number(timestamp);
  if (!Number.isFinite(epochMs) || Math.abs(Date.now() - epochMs) > MAX_CLOCK_SKEW_MS) return false;
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;

  const canonical = [timestamp, "POST", ROUTE_PATH, body].join("\n");
  const expected = createHmac("sha256", secret).update(canonical).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

function configuredChannels() {
  const generic = String(process.env.TELNYX_API_KEY || "").trim();
  const transactional = String(process.env.TELNYX_TRANSACTIONAL_API_KEY || generic).trim();
  const channels: Partial<Record<ChannelName, string>> = {
    concierge: String(process.env.TELNYX_CONCIERGE_API_KEY || transactional).trim(),
    crm: String(process.env.TELNYX_CRM_API_KEY || transactional).trim(),
    reservations: String(process.env.TELNYX_RESERVATIONS_API_KEY || transactional).trim(),
    support: String(process.env.TELNYX_SUPPORT_API_KEY || transactional).trim(),
  };
  const marketing = String(process.env.TELNYX_MARKETING_API_KEY || "").trim();
  if (marketing) channels.marketing = marketing;
  return channels;
}

function encryptValue(publicKey: string, value: string) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length < 20 || bytes.length > MAX_KEY_BYTES) {
    throw new Error("invalid_telnyx_key_length");
  }
  return publicEncrypt(
    {
      key: publicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    bytes,
  ).toString("base64");
}

export async function POST(request: Request) {
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "request_too_large" }, { status: 413 });
  }
  if (!authenticated(request, body)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let publicKey = "";
  try {
    const parsed = JSON.parse(body) as { publicKey?: unknown };
    publicKey = typeof parsed.publicKey === "string" ? parsed.publicKey.trim() : "";
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!publicKey.startsWith("-----BEGIN PUBLIC KEY-----") || publicKey.length > 5_000) {
    return NextResponse.json({ ok: false, error: "invalid_public_key" }, { status: 400 });
  }

  const channels = configuredChannels();
  const required: ChannelName[] = ["concierge", "crm", "reservations", "support"];
  if (required.some((purpose) => String(channels[purpose] || "").length < 20)) {
    return NextResponse.json({ ok: false, error: "telnyx_required_channels_not_configured" }, { status: 503 });
  }

  try {
    const ciphertexts: Partial<Record<ChannelName, string>> = {};
    for (const purpose of [...required, "marketing" as const]) {
      const value = channels[purpose];
      if (value) ciphertexts[purpose] = encryptValue(publicKey, value);
    }
    return NextResponse.json(
      { ok: true, channels: ciphertexts },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "encryption_failed" }, { status: 400 });
  }
}
