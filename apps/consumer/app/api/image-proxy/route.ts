import { NextResponse } from "next/server";
import { fetchAllowedHttpsUrl, readResponseWithLimit } from "@/lib/security/outbound-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_IMAGE_HOSTS = [
  "maps.googleapis.com",
  "lh3.googleusercontent.com",
  ".googleusercontent.com",
] as const;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    if (!url) return NextResponse.json({ error: "Invalid image URL." }, { status: 400 });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetchAllowedHttpsUrl(url, {
        allowedHosts: ALLOWED_IMAGE_HOSTS,
        maxRedirects: 3,
        signal: controller.signal,
        headers: { "User-Agent": "TheOutHaven/1.0" },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) return NextResponse.json({ error: "Image fetch failed." }, { status: 502 });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "Remote content is not an image." }, { status: 415 });
    }

    const body = await readResponseWithLimit(response, MAX_IMAGE_BYTES);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image proxy failed." }, { status: 400 });
  }
}
