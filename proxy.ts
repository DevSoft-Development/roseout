import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";

const rateRules: Array<{ prefix: string; limit: number; windowMs: number }> = [
  { prefix: "/api/auth", limit: 30, windowMs: 60_000 },
  { prefix: "/api/admin/search", limit: 60, windowMs: 60_000 },
  { prefix: "/api/contact", limit: 20, windowMs: 60_000 },
  { prefix: "/api/reservations", limit: 60, windowMs: 60_000 },
  { prefix: "/api/reserve", limit: 60, windowMs: 60_000 },
];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  for (const rule of rateRules) {
    if (pathname.startsWith(rule.prefix)) {
      const verdict = enforceRateLimit(`${rule.prefix}:${ip}`, rule.limit, rule.windowMs);
      if (!verdict.ok) {
        return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds || 60) } });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
