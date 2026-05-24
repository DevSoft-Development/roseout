import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("outings")
      .select("id,status")
      .eq("id", body.outing_id)
      .single();

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: "Outing not found",
        },
        { status: 404 }
      );
    }

    if (existing.status === "completed") {
      return NextResponse.json({
        success: true,
        alreadyCompleted: true,
      });
    }

    const { error } = await supabase
      .from("outings")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        rating: body.rating ?? null,
        matched_vibe: body.matched_vibe ?? null,
        would_go_again: body.would_go_again ?? null,
        feedback: body.feedback ?? null,
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
