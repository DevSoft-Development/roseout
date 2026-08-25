import { NextResponse } from "next/server";
import {
  fetchPlacePhotoNew,
  getPlacePhotoNameNew,
} from "@/lib/google/places-new-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
}

function clampWidth(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1200;
  return Math.max(1, Math.min(4800, Math.floor(parsed)));
}

function brandedPhotoFallback(request: Request, reason: string) {
  const fallbackUrl = new URL("/toh_logo.png", request.url);
  const response = NextResponse.redirect(fallbackUrl, 307);
  response.headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
  response.headers.set("X-TheOutHaven-Photo-Fallback", "1");
  response.headers.set(
    "X-TheOutHaven-Photo-Fallback-Reason",
    clean(reason).slice(0, 160) || "google_photo_unavailable",
  );
  return response;
}

async function proxyPhoto(photoName: string, maxWidthPx: number) {
  const response = await fetchPlacePhotoNew(photoName, {
    maxWidthPx,
    cache: "force-cache",
    revalidateSeconds: 60 * 60 * 24 * 14,
  });

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.startsWith("image/")) {
    const text = await response.text().catch(() => "");
    throw new Error(
      JSON.stringify({
        status: response.status,
        statusText: response.statusText,
        contentType,
        details: text.slice(0, 500),
      }),
    );
  }

  const body = await response.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType || "image/jpeg",
      "Cache-Control":
        "public, max-age=1209600, s-maxage=1209600, stale-while-revalidate=86400",
    },
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const placeId = clean(requestUrl.searchParams.get("placeId"));
  const ref = clean(requestUrl.searchParams.get("ref"));
  const maxWidthPx = clampWidth(requestUrl.searchParams.get("maxwidth"));

  if (!process.env.GOOGLE_PLACES_API_KEY?.trim()) {
    console.warn("[google-place-photo] GOOGLE_PLACES_API_KEY missing; using branded fallback");
    return brandedPhotoFallback(request, "missing_google_places_api_key");
  }

  if (!placeId && !ref) {
    return brandedPhotoFallback(request, "missing_place_id_or_ref");
  }

  try {
    if (placeId) {
      const photoName = await getPlacePhotoNameNew(placeId);
      return await proxyPhoto(photoName, maxWidthPx);
    }

    if (ref.startsWith("places/") && ref.includes("/photos/")) {
      return await proxyPhoto(ref, maxWidthPx);
    }

    return brandedPhotoFallback(request, "legacy_photo_reference_requires_place_id");
  } catch (error) {
    console.warn("[google-place-photo] Places API (New) photo proxy failed", {
      placeId: placeId || null,
      error: error instanceof Error ? error.message : String(error),
    });
    return brandedPhotoFallback(request, "google_photo_proxy_failed");
  }
}
