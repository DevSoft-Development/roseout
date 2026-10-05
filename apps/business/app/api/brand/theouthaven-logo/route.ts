import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOGO_FILE = "toh_logo_wordmark_white.webp";

async function readLogo() {
  const candidates = [
    path.join(process.cwd(), "public", LOGO_FILE),
    path.join(process.cwd(), "apps", "business", "public", LOGO_FILE),
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("TheOutHaven logo asset not found");
}

export async function GET() {
  try {
    const bytes = await readLogo();
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
        "X-TheOutHaven-Brand-Asset": "wordmark-white",
      },
    });
  } catch {
    return new Response("Brand asset unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
