import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { GET as resolveShortLink } from "../p/[code]/route";

function normalizedHostname(request: NextRequest) {
  return (
    request.headers.get("x-theouthaven-original-host") ||
    request.headers.get("host") ||
    request.nextUrl.hostname ||
    ""
  )
    .split(":")[0]
    .trim()
    .toLowerCase();
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const configuredHost = String(process.env.SHORT_LINK_HOST || "").trim().toLowerCase();
  if (!configuredHost || normalizedHostname(request) !== configuredHost) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return resolveShortLink(request, context);
}
