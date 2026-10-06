import { NextResponse } from "next/server";

export const dynamic = "force-static";

export function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/toh_logo_wordmark_white_20261006.webp", request.url), 307);
  response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return response;
}
