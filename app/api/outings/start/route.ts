import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const status =
      body.contact_method === "phone"
        ? "call_clicked"
        : "reservation_clicked";

    const payload = {
      user_id: null,
      location_id: isUuid(body.location_id) ? body.location_id : null,
      source_location_id: body.location_id ? String(body.location_id) : null,
      location_type: body.location_type ?? null,
      reservation_type: "external",
      external_reservation_url: body.external_reservation_url ?? null,
      phone_number: body.phone_number ?? null,
      contact_method: body.contact_method ?? null,
      source: body.source ?? "create_result_card",
      status,
      reservation_clicked_at:
        status === "reservation_clicked"
          ? new Date().toISOString()
          : null,
      call_clicked_at:
        status === "call_clicked"
          ? new Date().toISOString()
          : null,
      metadata: {
        title: body.title ?? null,
        name: body.name ?? null,
        address: body.address ?? null,
      },
    };

    const { data, error } = await supabaseAdmin
      .from("outings")
      .insert(payload)
      .select()
      .single();

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
