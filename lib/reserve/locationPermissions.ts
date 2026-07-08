import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveLocationAccessContext } from "@/lib/auth/locationOwnerAccess";

export type ReservePermissionKey = "viewDashboard"|"manageReservations"|"manageLayout"|"manageHours"|"manageReminders"|"manageQrCodes"|"editProfile"|"viewAnalytics"|"manageBilling"|"manageTeam";
export type ReserveRole = "location_admin"|"manager"|"host"|"marketing"|"view_only";

const ALL: Record<ReservePermissionKey, boolean> = { viewDashboard:true, manageReservations:true, manageLayout:true, manageHours:true, manageReminders:true, manageQrCodes:true, editProfile:true, viewAnalytics:true, manageBilling:true, manageTeam:true };
const VIEW: Record<ReservePermissionKey, boolean> = { viewDashboard:true, manageReservations:false, manageLayout:false, manageHours:false, manageReminders:false, manageQrCodes:false, editProfile:false, viewAnalytics:true, manageBilling:false, manageTeam:false };

export function getDefaultPermissionsForRole(role: string): Record<ReservePermissionKey, boolean> {
  if (role === "location_admin") return { ...ALL };
  if (role === "manager") return { ...VIEW, manageReservations:true, manageLayout:true, manageHours:true, manageReminders:true, manageQrCodes:true };
  if (role === "host") return { ...VIEW, manageReservations:true };
  if (role === "marketing") return { ...VIEW, manageQrCodes:true, editProfile:true };
  return { ...VIEW };
}

export function isLocationOwner(location: any, user: any) {
  const email = String(user?.email || "").toLowerCase();
  return Boolean(user?.id && location?.owner_user_id === user.id) || Boolean(email && [location?.owner_email, location?.claimed_by_email].map((v)=>String(v||"").toLowerCase()).includes(email));
}

export function canManageLocationTeam(access: any) { return Boolean(access?.permissions?.manageTeam); }

function roleLabel(role: string) {
  return String(role || "view_only").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function coerceReservePermissions(role: string, overrides: unknown): Record<ReservePermissionKey, boolean> {
  const base = getDefaultPermissionsForRole(role);
  const custom = overrides && typeof overrides === "object" ? overrides as Partial<Record<ReservePermissionKey, boolean>> : {};
  const merged = { ...base, ...custom };
  if (role === "view_only") Object.assign(merged, VIEW);
  return merged;
}

async function getReserveTeamMember(user: any, canonicalLocationId: string) {
  const email = String(user?.email || "").toLowerCase();
  let q = supabaseAdmin
    .from("location_team_members")
    .select("*")
    .eq("location_id", canonicalLocationId)
    .in("invitation_status", ["pending", "active", "accepted"])
    .limit(1);

  if (user?.id) q = q.or(`user_id.eq.${user.id},email.eq.${email}`);
  else q = q.eq("email", email);

  const { data: rows } = await q;
  return rows?.[0] ?? null;
}

export async function getReserveLocationAccess(user: any, locationId: string) {
  const access = await resolveLocationAccessContext({
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    locationId,
    allowDemoPreview: true,
  });

  const location = access.location as Record<string, any> | null;
  if (!access.isAuthenticated || !access.canonicalLocationId || !location) {
    return { allowed:false, role:"view_only", roleLabel:"View only", permissions:{...VIEW}, location:null };
  }

  if (access.isAdmin || access.isOwner || access.source === "demo") {
    const permissions = access.canEdit ? { ...ALL } : { ...VIEW };
    return {
      allowed:true,
      role:"location_admin",
      roleLabel:"Location admin",
      isAdmin: access.isAdmin,
      location,
      permissions,
    };
  }

  const member = await getReserveTeamMember(user, access.canonicalLocationId);
  if (member) {
    const role = String(member.role || "view_only") as ReserveRole;
    const permissions = coerceReservePermissions(role, member.permissions);
    return {
      allowed:Boolean(permissions.viewDashboard),
      role,
      roleLabel: roleLabel(role),
      permissions,
      location,
      member,
    };
  }

  if (access.canView) {
    const permissions = access.canEdit ? { ...ALL } : { ...VIEW };
    return {
      allowed:Boolean(permissions.viewDashboard),
      role: access.canEdit ? "location_admin" : "view_only",
      roleLabel: access.canEdit ? "Location admin" : "View only",
      permissions,
      location,
    };
  }

  return { allowed:false, role:"view_only", roleLabel:"View only", permissions:{...VIEW}, location };
}

export async function requireReservePermission(locationId: string, permissionKey: ReservePermissionKey) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ success:false, error:"Please sign in to continue." }, { status:401 }) } as any;
  const access = await getReserveLocationAccess(user, locationId);
  if (!access.allowed || !access.permissions?.[permissionKey]) return { error: NextResponse.json({ success:false, error:"You do not have permission to manage this location." }, { status:403 }), access, user } as any;
  return { access, user } as any;
}
