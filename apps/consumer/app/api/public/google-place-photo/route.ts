import { NextResponse } from "next/server";
import { platformIntegrationApiConfigured } from "@/lib/aws/integration-api";
import { fetchPlacePhotoNew } from "@/lib/google/places-new-client";
import { getGooglePhotoSlot } from "@/lib/google/place-photo-slots";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

function clampIndex(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(9, Math.floor(parsed)));
}

function monthlyCap() {
  const parsed = Number(process.env.GOOGLE_PHOTO_MONTHLY_REQUEST_CAP || "15000");
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 15000;
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

function unavailablePhotoResponse(request: Request, reason: string, lazyGoogleSlot: boolean) {
  if (!lazyGoogleSlot) return brandedPhotoFallback(request, reason);
  return new NextResponse(null, {
    status: 404,
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-TheOutHaven-Photo-Unavailable": "1",
      "X-TheOutHaven-Photo-Fallback-Reason": clean(reason).slice(0, 160) || "google_photo_unavailable",
    },
  });
}

async function reserveGooglePhotoRequest(placeId: string) {
  const { data, error } = await supabaseAdmin.rpc("reserve_google_photo_request", {
    p_google_place_id: placeId || "unknown",
    p_monthly_cap: monthlyCap(),
  });
  if (error) {
    console.warn("[google-place-photo] usage reservation failed", error.message);
    return { allowed: true, monthCount: null as number | null };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed !== false,
    monthCount: Number.isFinite(Number(row?.month_count)) ? Number(row.month_count) : null,
  };
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
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const placeId = clean(requestUrl.searchParams.get("placeId"));
  const ref = clean(requestUrl.searchParams.get("ref"));
  const index = clampIndex(requestUrl.searchParams.get("index"));
  const maxWidthPx = clampWidth(requestUrl.searchParams.get("maxwidth"));
  const lazyGoogleSlot = Boolean(placeId && index > 0);

  if (!platformIntegrationApiConfigured() && !process.env.GOOGLE_PLACES_API_KEY?.trim()) {
    console.warn("[google-place-photo] Google Places provider missing; using branded fallback");
    return unavailablePhotoResponse(request, "missing_google_places_api_key", lazyGoogleSlot);
  }

  if (!placeId && !ref) {
    return brandedPhotoFallback(request, "missing_place_id_or_ref");
  }

  try {
    let photoName = ref;
    if (placeId) {
      const slot = await getGooglePhotoSlot(placeId, index);
      if (!slot?.name) return unavailablePhotoResponse(request, "google_photo_slot_unavailable", lazyGoogleSlot);
      photoName = slot.name;
    } else if (!(ref.startsWith("places/") && ref.includes("/photos/"))) {
      return brandedPhotoFallback(request, "legacy_photo_reference_requires_place_id");
    }

    const usage = await reserveGooglePhotoRequest(placeId || "legacy_ref");
    if (!usage.allowed) {
      console.warn("[google-place-photo] monthly request cap reached", {
        placeId: placeId || null,
        monthCount: usage.monthCount,
        monthlyCap: monthlyCap(),
      });
      return unavailablePhotoResponse(request, "google_photo_monthly_cap_reached", lazyGoogleSlot);
    }

    const response = await proxyPhoto(photoName, maxWidthPx);
    response.headers.set("X-TheOutHaven-Google-Photo-Index", String(index));
    if (usage.monthCount !== null) {
      response.headers.set("X-TheOutHaven-Google-Photo-Month-Count", String(usage.monthCount));
    }
    return response;
  } catch (error) {
    console.warn("[google-place-photo] Places API (New) photo proxy failed", {
      placeId: placeId || null,
      index,
      error: error instanceof Error ? error.message : String(error),
    });
    return unavailablePhotoResponse(request, "google_photo_proxy_failed", lazyGoogleSlot);
  }
}
