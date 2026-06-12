import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
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
  try {
    const requestUrl = new URL(request.url);
    const placeId = clean(requestUrl.searchParams.get("placeId"));
    const ref = clean(requestUrl.searchParams.get("ref"));
    const maxwidth = clean(requestUrl.searchParams.get("maxwidth")) || "1200";

    const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;

    if (!key) {
      return NextResponse.json(
        {
          error: "Missing GOOGLE_PLACES_API_KEY or GOOGLE_API_KEY.",
          hasGooglePlacesKey: Boolean(process.env.GOOGLE_PLACES_API_KEY),
          hasGoogleApiKey: Boolean(process.env.GOOGLE_API_KEY),
        },
        { status: 500 },
      );
    }

    if (!placeId && !ref) {
      return NextResponse.json(
        { error: "Missing placeId or ref." },
        { status: 400 },
      );
    }

    const photoReference = placeId
      ? await fetchFreshPhotoReference(placeId, key)
      : ref;

    return await fetchGooglePhoto(photoReference, maxwidth, key);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Google photo proxy failed.",
      },
      { status: 500 },
    );
  }
}
