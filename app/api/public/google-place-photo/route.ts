import { NextResponse } from "next/server";
import {
  fetchPlacePhotoNew,
  getPlacePhotoMetadataNew,
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
    cache: "no-store",
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
      "Cache-Control": "no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const placeId = clean(requestUrl.searchParams.get("placeId"));
  const maxWidthPx = clampWidth(requestUrl.searchParams.get("maxwidth"));

  if (!process.env.GOOGLE_PLACES_API_KEY?.trim()) {
    console.warn("[google-place-photo] GOOGLE_PLACES_API_KEY missing; using branded fallback");
    return brandedPhotoFallback(request, "missing_google_places_api_key");
  }

  if (!placeId) {
    return brandedPhotoFallback(request, "missing_place_id");
  }

  try {
    // Fetch a fresh photo resource name from the durable Place ID each time.
    // Photo resource names themselves are not persisted or accepted as input.
    const photo = await getPlacePhotoMetadataNew(placeId);
    if (photo.authorAttributions.length > 0) {
      // The current location-card surface does not yet render photo-author
      // attribution. Do not display a photo that requires it.
      return brandedPhotoFallback(request, "photo_requires_author_attribution");
    }
    return await proxyPhoto(photo.name, maxWidthPx);
  } catch (error) {
    console.warn("[google-place-photo] Places API (New) photo proxy failed", {
      placeId,
      error: error instanceof Error ? error.message : String(error),
    });
    return brandedPhotoFallback(request, "google_photo_proxy_failed");
  }
}