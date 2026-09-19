import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDefaultPermissionsForRole, getReserveCanonicalLocationId, requireReservePermission } from "@/lib/reserve/locationPermissions";

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId") || "";
  const auth = await requireReservePermission(locationId, "viewDashboard");
  if (auth.error) return auth.error;
  const resolvedLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const { data } = await supabaseAdmin
    .from("location_team_members")
    .select("*")
    .eq("location_id", resolvedLocationId)
    .order("created_at", { ascending: false });
  return NextResponse.json({ success: true, members: data || [], access: auth.access });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const locationId = String(body.locationId || "");
  const auth = await requireReservePermission(locationId, "manageTeam");
  if (auth.error) return auth.error;
  const resolvedLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const role = String(body.role || "view_only");
  const row = {
    location_id: resolvedLocationId,
    email: String(body.email || "").toLowerCase().trim(),
    name: String(body.name || "").trim() || null,
    role,
    permissions: { ...getDefaultPermissionsForRole(role), ...(body.permissions || {}) },
    invited_by: auth.user.id,
    invitation_token: crypto.randomBytes(24).toString("hex"),
    invitation_status: "pending",
  };
  if (!row.email) return NextResponse.json({ success: false, error: "Enter an email address." }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from("location_team_members")
    .upsert(row, { onConflict: "location_id,email" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ success: false, error: "We could not invite this team member." }, { status: 500 });
  return NextResponse.json({ success: true, message: "Invite sent.", member: data, inviteLink: `/login?locationInvite=${data.invitation_token}` });
}
