import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NONCE_PATTERN = /^[A-Za-z0-9:._-]{16,240}$/;

function configuredControl() {
  const gatewayUrl = String(process.env.AWS_PLATFORM_DR_GATEWAY_URL || "").trim().replace(/\/$/, "");
  const secret = String(process.env.AWS_PLATFORM_DR_GATEWAY_SECRET || "").trim();
  return { gatewayUrl, secret };
}

function safeHexEqual(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export async function POST(request: NextRequest) {
  const { gatewayUrl: configuredUrl, secret } = configuredControl();
  if (!configuredUrl || !secret) {
    return NextResponse.json({ ok: false, configured: false }, {
      status: 503,
      headers: { "cache-control": "no-store, max-age=0" },
    });
  }

  const body = await request.json().catch(() => ({})) as {
    nonce?: unknown;
    gatewayUrl?: unknown;
    signature?: unknown;
  };
  const nonce = String(body.nonce || "");
  const gatewayUrl = String(body.gatewayUrl || "").trim().replace(/\/$/, "");
  const signature = String(body.signature || "").trim();

  if (!NONCE_PATTERN.test(nonce) || !/^https:\/\//i.test(gatewayUrl)) {
    return NextResponse.json({ ok: false, configured: true }, {
      status: 400,
      headers: { "cache-control": "no-store, max-age=0" },
    });
  }

  const expected = createHmac("sha256", secret)
    .update(`${nonce}\n${configuredUrl}`)
    .digest("hex");
  const ok = gatewayUrl === configuredUrl && safeHexEqual(signature, expected);

  return NextResponse.json({ ok, configured: true }, {
    status: ok ? 200 : 403,
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
