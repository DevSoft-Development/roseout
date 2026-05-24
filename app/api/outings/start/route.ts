import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const supabase = await createClient();

    const status =
      body.contact_method === "phone"
        ? "call_clicked"
        : "reservation_clicked";

    const payload = {
      user_id: null,
      location_id: body.location_id ?? null,
      location_type: body.location_type ?? null,
      reservation_type: "external",
      external_reservation_url: body.external_reservation_url ?? null,
      phone_number: body.phone_number ?? null,
      contact_method: body.contact_method ?? null,
      status,
      reservation_clicked_at:
        status === "reservation_clicked"
          ? new Date().toISOString()
          : null,
      call_clicked_at:
        status === "call_clicked"
          ? new Date().toISOString()
          : null,
    };

    const { data, error } = await supabase
      .from("outings")
      .insert(payload)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
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
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
