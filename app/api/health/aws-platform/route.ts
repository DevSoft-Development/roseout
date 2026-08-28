import { NextResponse } from "next/server";
import {
  getPlatformJobGatewayStatus,
  platformJobGatewayConfigured,
} from "@/lib/aws/platform-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deliveryMode() {
  const value = String(process.env.EMAIL_DELIVERY_MODE || "resend").trim().toLowerCase();
  return value === "hybrid" || value === "ses" ? value : "resend";
}

export async function GET() {
  const mode = deliveryMode();
  const configured = platformJobGatewayConfigured();

  if (!configured) {
    return NextResponse.json(
      {
        ok: false,
        aws_gateway_configured: false,
        aws_gateway_authenticated: false,
        email_delivery_mode: mode,
        email_traffic_on_aws: mode !== "resend",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const status = await getPlatformJobGatewayStatus();
    const authenticated = status.ok === true && status.authenticated === true;
    return NextResponse.json(
      {
        ok: authenticated,
        aws_gateway_configured: true,
        aws_gateway_authenticated: authenticated,
        aws_environment: status.environment || null,
        email_delivery_mode: mode,
        email_traffic_on_aws: mode !== "resend",
      },
      {
        status: authenticated ? 200 : 502,
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        aws_gateway_configured: true,
        aws_gateway_authenticated: false,
        email_delivery_mode: mode,
        email_traffic_on_aws: mode !== "resend",
        error: error instanceof Error ? error.message : "aws_gateway_health_failed",
      },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
