import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { updateLocationImageWithCachedUrl } from "@/lib/cacheLocationImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
}

function sanitizeSearch(value: string) {
  return value.replace(/[%*,]/g, "").trim();
}

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationsEdit);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));

    const id = clean(body.id);
    const name = sanitizeSearch(clean(body.name));

    if (!id && !name) {
      return NextResponse.json(
        { error: "Pass either id or name." },
        { status: 400 },
      );
    }

    let query = supabaseAdmin
      .from("locations")
      .select(
        "id,name,restaurant_name,activity_name,address,city,state,main_image,image_url,images,has_photos,photo_status",
      )
      .limit(1);

    if (id) {
      query = query.eq("id", id);
    } else {
      query = query.or(
        `name.ilike.%${name}%,restaurant_name.ilike.%${name}%,activity_name.ilike.%${name}%`,
      );
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Location not found." },
        { status: 404 },
      );
    }

    const result = await updateLocationImageWithCachedUrl(data);

    return NextResponse.json({
      success: Boolean(result.cached || ("skipped" in result && result.skipped)),
      location: {
        id: data.id,
        name: data.name || data.restaurant_name || data.activity_name,
      },
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Image cache failed.",
      },
      { status: 500 },
    );
  }
}
