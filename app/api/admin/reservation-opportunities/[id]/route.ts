import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiRole } from "@/lib/admin-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set([
  "not_contacted",
  "contacted",
  "interested",
  "not_interested",
  "claimed",
  "onboarded",
]);

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Missing Supabase admin environment variables");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireAuthorization(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const xAdminSecret = request.headers.get("x-admin-secret")?.trim() || "";
  const adminSecret = process.env.ADMIN_API_SECRET?.trim();

  if (
    adminSecret &&
    (bearerToken === adminSecret || xAdminSecret === adminSecret)
  )
    return null;

  const { error } = await requireAdminApiRole(["superadmin", "admin", "editor"]);
  if (!error) return null;

  return NextResponse.json(
    { success: false, error: "Unauthorized" },
    { status: 401 },
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAuthorization(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const status =
    typeof body.reservation_outreach_status === "string"
      ? body.reservation_outreach_status.trim()
      : "";

  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { success: false, error: "Invalid reservation_outreach_status" },
      { status: 400 },
    );
  }

  const notes =
    typeof body.reservation_outreach_notes === "string"
      ? body.reservation_outreach_notes
      : null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("locations")
    .update({
      reservation_outreach_status: status,
      reservation_outreach_notes: notes,
    })
    .eq("id", id)
    .select("id,reservation_outreach_status,reservation_outreach_notes")
    .maybeSingle();

  if (error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  if (!data)
    return NextResponse.json(
      { success: false, error: "Opportunity not found" },
      { status: 404 },
    );

  return NextResponse.json({ success: true, opportunity: data });
}
