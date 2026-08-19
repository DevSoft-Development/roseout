import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
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

async function fetchFreshPhotoReference(placeId: string, key: string) {
  const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  detailsUrl.searchParams.set("place_id", placeId);
  detailsUrl.searchParams.set("fields", "photos");
  detailsUrl.searchParams.set("key", key);

  const response = await fetch(detailsUrl.toString(), {
    cache: "force-cache",
    next: { revalidate: 60 * 60 * 24 * 7 },
  });

  const json = await response.json().catch(() => null);

  if (!response.ok || json?.status !== "OK") {
    throw new Error(
      json?.error_message ||
        `Google Place Details failed with status ${json?.status || response.status}`,
    );
  }

  const photoReference = clean(json?.result?.photos?.[0]?.photo_reference);

  if (!photoReference) {
    throw new Error("Google Place Details returned no photo_reference.");
  }

  return photoReference;
}

async function fetchGooglePhoto(photoReference: string, maxwidth: string, key: string) {
  const googleUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
  googleUrl.searchParams.set("maxwidth", maxwidth);
  googleUrl.searchParams.set("photo_reference", photoReference);
  googleUrl.searchParams.set("key", key);

  const response = await fetch(googleUrl.toString(), {
    redirect: "follow",
    headers: {
      "User-Agent": "TheOutHaven/1.0",
    },
    cache: "force-cache",
    next: { revalidate: 60 * 60 * 24 * 14 },
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
  const maxwidth = clean(requestUrl.searchParams.get("maxwidth")) || "1200";

  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;

  if (!key) {
    console.warn("[google-place-photo] Google API key missing; using branded fallback");
    return brandedPhotoFallback(request, "missing_google_api_key");
  }

  if (!placeId && !ref) {
    return brandedPhotoFallback(request, "missing_place_id_or_ref");
  }

  try {
    if (placeId) {
      try {
        const freshPhotoReference = await fetchFreshPhotoReference(placeId, key);
        return await fetchGooglePhoto(freshPhotoReference, maxwidth, key);
      } catch (freshError) {
        if (ref) {
          try {
            return await fetchGooglePhoto(ref, maxwidth, key);
          } catch (storedRefError) {
            console.warn("[google-place-photo] fresh and stored photo references failed", {
              placeId,
              freshError:
                freshError instanceof Error ? freshError.message : String(freshError),
              storedRefError:
                storedRefError instanceof Error
                  ? storedRefError.message
                  : String(storedRefError),
            });
            return brandedPhotoFallback(request, "fresh_and_stored_photo_failed");
          }
        }

        console.warn("[google-place-photo] fresh photo lookup failed", {
          placeId,
          error: freshError instanceof Error ? freshError.message : String(freshError),
        });
        return brandedPhotoFallback(request, "fresh_photo_lookup_failed");
      }
    }

    return await fetchGooglePhoto(ref, maxwidth, key);
  } catch (error) {
    console.warn("[google-place-photo] photo proxy failed; using branded fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return brandedPhotoFallback(request, "google_photo_proxy_failed");
  }
}
