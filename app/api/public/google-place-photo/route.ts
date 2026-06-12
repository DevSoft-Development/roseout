import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const photoReference = clean(url.searchParams.get("ref"));
    const maxwidth = clean(url.searchParams.get("maxwidth")) || "1200";

    if (!photoReference) {
      return NextResponse.json(
        { error: "Missing photo reference." },
        { status: 400 },
      );
    }

    const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;

    if (!key) {
      return NextResponse.json(
        { error: "Missing Google Places API key." },
        { status: 500 },
      );
    }

    const googleUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
    googleUrl.searchParams.set("maxwidth", maxwidth);
    googleUrl.searchParams.set("photo_reference", photoReference);
    googleUrl.searchParams.set("key", key);

    const response = await fetch(googleUrl.toString(), {
      redirect: "follow",
      cache: "force-cache",
      next: { revalidate: 60 * 60 * 24 * 14 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Google photo request failed." },
        { status: response.status },
      );
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=1209600, s-maxage=1209600, stale-while-revalidate=86400",
      },
    });
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
