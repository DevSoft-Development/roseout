import { NextResponse } from "next/server";
import { getGooglePhotoSlot } from "@/lib/google/place-photo-slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
}

function clampIndex(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(9, Math.floor(parsed)));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const placeId = clean(url.searchParams.get("placeId"));
  const index = clampIndex(url.searchParams.get("index"));

  if (!placeId) {
    return NextResponse.json({ ok: false, error: "Missing placeId." }, { status: 400 });
  }

  try {
    const slot = await getGooglePhotoSlot(placeId, index);
    if (!slot) {
      return NextResponse.json({ ok: false, error: "Photo slot unavailable." }, { status: 404 });
    }

    return NextResponse.json(
      {
        ok: true,
        index: slot.index,
        widthPx: slot.widthPx,
        heightPx: slot.heightPx,
        attributions: slot.attributions,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to load photo metadata.",
      },
      { status: 502 },
    );
  }
}
