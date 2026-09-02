import { createHmac, publicEncrypt, timingSafeEqual, constants } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 8_000;
const ROUTE_PATH = "/api/internal/aws-bootstrap/stripe-secret";

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

  const stripeSecret = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (stripeSecret.length < 16) {
    return NextResponse.json({ ok: false, error: "stripe_secret_not_configured" }, { status: 503 });
  }

  try {
    const encrypted = publicEncrypt(
      {
        key: publicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(stripeSecret, "utf8"),
    );
    return NextResponse.json(
      { ok: true, ciphertext: encrypted.toString("base64") },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "encryption_failed" }, { status: 400 });
  }
}
