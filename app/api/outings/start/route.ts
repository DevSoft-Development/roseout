import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!body.location_id) {
      console.error("THEOUTHAVEN_OUTING_START_MISSING_LOCATION_ID", { body });
    }
    if (body.contact_method === "phone" && !body.phone_number) {
      console.error("THEOUTHAVEN_OUTING_START_MISSING_PHONE_NUMBER", { body });
    }
    if (body.contact_method !== "phone" && !body.external_reservation_url) {
      console.error("THEOUTHAVEN_OUTING_START_MISSING_EXTERNAL_URL", { body });
    }

    const now = new Date().toISOString();
    const payload = {
      user_id: user?.id ?? null,
      location_id: isUuid(body.location_id) ? body.location_id : null,
      source_location_id: body.location_id ? String(body.location_id) : null,
      location_type: body.location_type ?? null,
      reservation_type: "external",
      external_reservation_url: body.external_reservation_url ?? null,
      phone_number: body.phone_number ?? null,
      contact_method: body.contact_method ?? null,
      source: body.source ?? "create_result_card",
      status: "planned",
      reservation_clicked_at: body.contact_method === "phone" ? null : now,
      call_clicked_at: body.contact_method === "phone" ? now : null,
      metadata: {
        title: body.title ?? null,
        name: body.name ?? null,
        address: body.address ?? null,
      },
    };

    const query = supabaseAdmin
      .from("outings")
      .select("id")
      .eq("source_location_id", payload.source_location_id)
      .eq("location_type", payload.location_type)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1);
    const { data: existingOutings } = payload.user_id
      ? await query.eq("user_id", payload.user_id)
      : await query.is("user_id", null);

    let data: { id: string } | null = null;
    let error: any = null;
    if (existingOutings?.[0]?.id) {
      ({ data, error } = await supabaseAdmin
        .from("outings")
        .update(payload)
        .eq("id", existingOutings[0].id)
        .select("id")
        .single());
    } else {
      ({ data, error } = await supabaseAdmin
        .from("outings")
        .insert(payload)
        .select("id")
        .single());
    }

    if (error) {
      console.error("THEOUTHAVEN_OUTING_START_ERROR", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        payload,
      });
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
        { status: 500 }
      );
    }

    console.info("THEOUTHAVEN_OUTING_TRACKING_STARTED", {
      outing_id: data.id,
      location_id: payload.source_location_id,
      contact_method: payload.contact_method,
    });

    return NextResponse.json({
      success: true,
      outing_id: data.id,
      redirect_url:
        body.external_reservation_url ??
        (body.phone_number ? `tel:${body.phone_number}` : null),
    });
  } catch (error: any) {
    console.error("THEOUTHAVEN_OUTING_START_ERROR", {
      message: error?.message,
      stack: error?.stack,
    });
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
