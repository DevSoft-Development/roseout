import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locations);
  if (auth.error) return auth.error;
  const supabaseAdmin = getSupabaseAdminClient();
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ restaurant: data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationsEdit);
  if (auth.error) return auth.error;
  const supabaseAdmin = getSupabaseAdminClient();
  const { id } = await params;
  const body = await request.json();

  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .update(body)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ restaurant: data });
}