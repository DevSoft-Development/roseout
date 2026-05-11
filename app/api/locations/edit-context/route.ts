import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type LocationType = "restaurants" | "activities";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function validType(type: string | null): type is LocationType {
  return type === "restaurants" || type === "activities";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const requestedType = searchParams.get("type");
    const requestedId = searchParams.get("id");

    if (!validType(requestedType) || !requestedId) {
      return NextResponse.json(
        { error: "Missing or invalid location request." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    const impersonatedLocationId =
      cookieStore.get("theouthaven_impersonate_location_id")?.value;

    const impersonatedLocationType =
      cookieStore.get("theouthaven_impersonate_location_type")?.value;

    const isLocationImpersonation =
      impersonatedLocationId &&
      validType(impersonatedLocationType || "") &&
      impersonatedLocationType === requestedType;

    const finalId = isLocationImpersonation
      ? impersonatedLocationId
      : requestedId;

    const supabase = adminSupabase();

    const { data, error } = await supabase
      .from(requestedType)
      .select("*")
      .eq("id", finalId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { error: "Location not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      location: data,
      effectiveId: finalId,
      isImpersonating: Boolean(isLocationImpersonation),
    });
  } catch (error) {
    console.error("Edit context load error:", error);

    return NextResponse.json(
      { error: "Failed to load location." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();

    const requestedType = body.type;
    const requestedId = body.id;
    const payload = body.payload;

    if (!validType(requestedType) || !requestedId || !payload) {
      return NextResponse.json(
        { error: "Missing update details." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    const impersonatedLocationId =
      cookieStore.get("theouthaven_impersonate_location_id")?.value;

    const impersonatedLocationType =
      cookieStore.get("theouthaven_impersonate_location_type")?.value;

    const isLocationImpersonation =
      impersonatedLocationId &&
      validType(impersonatedLocationType || "") &&
      impersonatedLocationType === requestedType;

    const finalId = isLocationImpersonation
      ? impersonatedLocationId
      : requestedId;

    const updatePayload = { ...payload };

    // Some Roseout location schemas do not include the legacy score columns.
    // Scores are calculated for display on the client, but should not block
    // saving owner/admin edits when the column is absent from Supabase.
    delete updatePayload.theouthaven_score;
    delete updatePayload.quality_score;

    const supabase = adminSupabase();

    const { error } = await supabase
      .from(requestedType)
      .update(updatePayload)
      .eq("id", finalId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      effectiveId: finalId,
      isImpersonating: Boolean(isLocationImpersonation),
    });
  } catch (error) {
    console.error("Edit context save error:", error);

    return NextResponse.json(
      { error: "Failed to save location." },
      { status: 500 }
    );
  }
}