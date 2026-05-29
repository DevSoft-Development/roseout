import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type LocationType = "restaurants" | "activities";
type TargetType = "user" | "location_owner";

function normalizeTargetType(value: unknown, hasLocation: boolean): TargetType {
  if (value === "location_owner") return "location_owner";
  return hasLocation ? "location_owner" : "user";
}

async function logImpersonation(payload: Record<string, unknown>) {
  await supabaseAdmin.from("admin_impersonation_logs").insert(payload);
  await supabaseAdmin.from("admin_system_logs").insert({
    category: "Impersonation",
    level: "info",
    message: "Admin impersonation started.",
    actor_id: payload.admin_id ?? null,
    actor_email: payload.admin_email ?? null,
    entity_type: payload.action ?? "impersonation",
    entity_id: payload.target_user_id ?? payload.location_id ?? null,
    metadata: payload,
  });
}

export async function POST(req: Request) {
  try {
    const { error, adminUser } = await requireAdminApiRole(["superadmin", "admin"]);
    if (error) return error;

    const body = await req.json();
    const locationId = typeof body.locationId === "string" ? body.locationId : null;
    const locationType = typeof body.locationType === "string" ? body.locationType : null;
    const targetType = normalizeTargetType(body.targetType, Boolean(locationId));
    const requestedUserId = typeof body.targetUserId === "string" ? body.targetUserId : typeof body.userId === "string" ? body.userId : null;

    const cookieStore = await cookies();

    if (targetType === "user" && requestedUserId) {
      const { data: targetUser } = await supabaseAdmin
        .from("users")
        .select("id,email,full_name,role")
        .eq("id", requestedUserId)
        .maybeSingle();

      if (!targetUser) {
        return NextResponse.json({ error: "Target user not found" }, { status: 404 });
      }

      if (targetUser.id === adminUser?.user_id || targetUser.email === adminUser?.email) {
        return NextResponse.json({ error: "You cannot impersonate yourself." }, { status: 400 });
      }

      const { data: targetAdminUser } = await supabaseAdmin
        .from("admin_users")
        .select("role")
        .eq("user_id", targetUser.id)
        .maybeSingle();
      const targetRoleSource = targetAdminUser?.role || targetUser.role;
      const targetRole = targetRoleSource === "superuser" || targetRoleSource === "super_admin" ? "superadmin" : targetRoleSource;
      if (targetRole === "superadmin" && adminUser?.role !== "superadmin") {
        return NextResponse.json({ error: "Only super admins can impersonate another super admin." }, { status: 403 });
      }

      cookieStore.delete("theouthaven_impersonate_location_id");
      cookieStore.delete("theouthaven_impersonate_location_type");
      cookieStore.set("theouthaven_impersonate_user_id", targetUser.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 30,
      });

      await logImpersonation({
        admin_id: adminUser?.user_id,
        admin_email: adminUser?.email,
        target_user_id: targetUser.id,
        target_user_email: targetUser.email,
        target_type: "user",
        action: "started_user",
      });

      return NextResponse.json({ success: true, message: "User impersonation started.", redirectTo: "/user/dashboard" });
    }

    if (!locationId || !locationType) {
      return NextResponse.json({ error: "Missing location impersonation target" }, { status: 400 });
    }

    if (locationType !== "restaurants" && locationType !== "activities") {
      return NextResponse.json({ error: "Invalid location type" }, { status: 400 });
    }

    const table = locationType as LocationType;
    const nameField = table === "restaurants" ? "restaurant_name" : "activity_name";
    const { data: location } = await supabaseAdmin
      .from(table)
      .select(`id, ${nameField}, owner_email, owner_user_id`)
      .eq("id", locationId)
      .maybeSingle();

    if (!location) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    if (!location.owner_user_id) {
      return NextResponse.json({ error: "This location has no connected owner account." }, { status: 400 });
    }

    if (requestedUserId && requestedUserId !== location.owner_user_id) {
      return NextResponse.json({ error: "Target owner is not connected to this location." }, { status: 400 });
    }

    const { data: targetUser } = await supabaseAdmin
      .from("users")
      .select("id,email,full_name,role")
      .eq("id", location.owner_user_id)
      .maybeSingle();

    if (!targetUser) {
      return NextResponse.json({ error: "Connected owner account not found" }, { status: 404 });
    }

    if (targetUser.id === adminUser?.user_id || targetUser.email === adminUser?.email) {
      return NextResponse.json({ error: "You cannot impersonate yourself." }, { status: 400 });
    }

    const { data: targetAdminUser } = await supabaseAdmin
      .from("admin_users")
      .select("role")
      .eq("user_id", targetUser.id)
      .maybeSingle();
    const targetRoleSource = targetAdminUser?.role || targetUser.role;
    const targetRole = targetRoleSource === "superuser" || targetRoleSource === "super_admin" ? "superadmin" : targetRoleSource;
    if (targetRole === "superadmin" && adminUser?.role !== "superadmin") {
      return NextResponse.json({ error: "Only super admins can impersonate another super admin." }, { status: 403 });
    }

    cookieStore.delete("theouthaven_impersonate_user_id");
    cookieStore.set("theouthaven_impersonate_location_id", String(location.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 30,
    });
    cookieStore.set("theouthaven_impersonate_location_type", table, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 30,
    });

    await logImpersonation({
      admin_id: adminUser?.user_id,
      admin_email: adminUser?.email,
      target_user_id: targetUser.id,
      target_user_email: targetUser.email || location.owner_email || null,
      target_type: "location_owner",
      location_id: location.id,
      location_type: table,
      action: `started_location_${table}`,
    });

    return NextResponse.json({ success: true, message: "Location owner impersonation started.", redirectTo: "/locations/dashboard" });
  } catch (error) {
    console.error("Impersonation error:", error);
    return NextResponse.json({ error: "Failed to start impersonation" }, { status: 500 });
  }
}
