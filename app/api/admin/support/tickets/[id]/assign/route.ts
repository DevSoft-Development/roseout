import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiRole } from "@/lib/admin-api-auth";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminApiRole(["superuser", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const department = String(body.department || "").trim() || null;
  const assignedAdminEmail = String(body.assigned_admin_email || "").trim().toLowerCase() || null;

  const { data, error: updateError } = await adminSupabase()
    .from("support_tickets")
    .update({
      department,
      assigned_admin_email: assignedAdminEmail,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, ticket: data });
}
