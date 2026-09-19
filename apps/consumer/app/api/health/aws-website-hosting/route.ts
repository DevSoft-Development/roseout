import { NextResponse } from "next/server";
import {
  awsWebsiteHostingConfigured,
  getAwsWebsiteHostingStatus,
  getWebsiteHostingMode,
} from "@/lib/websites/aws-hosting-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const hostingMode = getWebsiteHostingMode();
  const configured = awsWebsiteHostingConfigured();

  if (!configured) {
    return NextResponse.json({
      ok: true,
      website_hosting_mode: hostingMode,
      aws_gateway_configured: false,
      aws_gateway_authenticated: false,
    });
  }

  try {
    const status = await getAwsWebsiteHostingStatus();
    return NextResponse.json({
      ok: true,
      website_hosting_mode: hostingMode,
      aws_gateway_configured: true,
      aws_gateway_authenticated: status.ok === true && status.authenticated === true,
      aws_environment: status.environment,
      provider: status.provider,
      routing_endpoint: status.routingEndpoint,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      website_hosting_mode: hostingMode,
      aws_gateway_configured: true,
      aws_gateway_authenticated: false,
      error: error instanceof Error ? error.message : "aws_website_hosting_probe_failed",
    }, { status: 502 });
  }
}
