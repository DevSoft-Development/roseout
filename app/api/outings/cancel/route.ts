import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const supabase = await createClient();

    const { error } = await supabase
      .from("outings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", body.outing_id);

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
