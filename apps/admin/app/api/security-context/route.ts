import { NextRequest, NextResponse } from "next/server";

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "Unknown";
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "Unknown"
  );
}

function describeBrowser(userAgent: string) {
  if (!userAgent) return "Unknown browser";
  if (/Edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent)) return "Google Chrome";
  if (/Firefox\//i.test(userAgent)) return "Mozilla Firefox";
  if (/Safari\//i.test(userAgent) && /Version\//i.test(userAgent)) return "Safari";
  return "Browser detected";
}

function describePlatform(userAgent: string) {
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return "Android device";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows PC";
  if (/Linux/i.test(userAgent)) return "Linux device";
  return "Device detected";
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "";

  console.info(
    "ADMIN_LOGIN_SECURITY_CONTEXT",
    JSON.stringify({
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
      host: request.headers.get("host") || null,
    }),
  );

  return NextResponse.json(
    {
      ip,
      browser: describeBrowser(userAgent),
      platform: describePlatform(userAgent),
    },
    {
      headers: {
        "Cache-Control": "no-store, private",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
