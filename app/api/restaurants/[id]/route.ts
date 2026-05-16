import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPubliclyVisible } from "@/lib/locationVisibility";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", id)
    .eq("is_searchable", true)
    .eq("data_status", "clean")
    .neq("is_hidden", true)
    .not("status", "in", '("closed","archived")')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!isPubliclyVisible(data)) {
    return NextResponse.json(
      { error: "Restaurant not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ restaurant: data });
}
