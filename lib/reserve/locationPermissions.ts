import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOptionalCurrentAdmin, isAdminLocationWriteRole, isAdminLocationViewRole } from "@/lib/admin/admin-access";

export type ReservePermissionKey = "viewDashboard"|"manageReservations"|"manageLayout"|"manageHours"|"manageReminders"|"manageQrCodes"|"editProfile"|"viewAnalytics"|"manageBilling"|"manageTeam";
export type ReserveRole = "location_admin"|"manager"|"host"|"marketing"|"view_only";
const ALL: Record<ReservePermissionKey, boolean> = { viewDashboard:true, manageReservations:true, manageLayout:true, manageHours:true, manageReminders:true, manageQrCodes:true, editProfile:true, viewAnalytics:true, manageBilling:true, manageTeam:true };
const VIEW: Record<ReservePermissionKey, boolean> = { viewDashboard:true, manageReservations:false, manageLayout:false, manageHours:false, manageReminders:false, manageQrCodes:false, editProfile:false, viewAnalytics:true, manageBilling:false, manageTeam:false };
export function getDefaultPermissionsForRole(role: string): Record<ReservePermissionKey, boolean> { if (role === "location_admin") return { ...ALL }; if (role === "manager") return { ...VIEW, manageReservations:true, manageLayout:true, manageHours:true, manageReminders:true, manageQrCodes:true }; if (role === "host") return { ...VIEW, manageReservations:true }; if (role === "marketing") return { ...VIEW, manageQrCodes:true, editProfile:true }; return { ...VIEW }; }
export function isLocationOwner(location: any, user: any) { const email = String(user?.email || "").toLowerCase(); return Boolean(user?.id && location?.owner_user_id === user.id) || Boolean(email && [location?.owner_email, location?.claimed_by_email].map((v)=>String(v||"").toLowerCase()).includes(email)); }
export function canManageLocationTeam(access: any) { return Boolean(access?.permissions?.manageTeam); }
export async function getReserveLocationAccess(user: any, locationId: string) { const admin = await getOptionalCurrentAdmin(); if (admin && isAdminLocationViewRole(admin.role)) { return { allowed:true, role:"location_admin", roleLabel:"Location admin", isAdmin:true, location:null, permissions: isAdminLocationWriteRole(admin.role) ? { ...ALL } : { ...VIEW } }; }
 const { data: location } = await supabaseAdmin.from("locations").select("id,owner_user_id,owner_email,claimed_by_email").eq("id", locationId).maybeSingle();
 if (!location) return { allowed:false, role:"view_only", roleLabel:"View only", permissions:{...VIEW}, location:null };
 if (isLocationOwner(location, user)) return { allowed:true, role:"location_admin", roleLabel:"Location admin", permissions:{...ALL}, location };
 const email = String(user?.email || "").toLowerCase();
 let q = supabaseAdmin.from("location_team_members").select("*").eq("location_id", locationId).in("invitation_status", ["pending","active","accepted"]).limit(1);
 if (user?.id) q = q.or(`user_id.eq.${user.id},email.eq.${email}`); else q = q.eq("email", email);
 const { data: rows } = await q;
 const member = rows?.[0]; if (!member) return { allowed:false, role:"view_only", roleLabel:"View only", permissions:{...VIEW}, location };
 const base = getDefaultPermissionsForRole(member.role); const merged = { ...base, ...(member.permissions || {}) }; if (member.role === "view_only") Object.assign(merged, VIEW);
 return { allowed:Boolean(merged.viewDashboard), role: member.role, roleLabel: String(member.role).replace("_"," ").replace(/\b\w/g,(c)=>c.toUpperCase()), permissions: merged, location, member };
}
export async function requireReservePermission(locationId: string, permissionKey: ReservePermissionKey) { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: NextResponse.json({ success:false, error:"Please sign in to continue." }, { status:401 }) } as any; const access = await getReserveLocationAccess(user, locationId); if (!access.allowed || !access.permissions?.[permissionKey]) return { error: NextResponse.json({ success:false, error:"You do not have permission to manage this location." }, { status:403 }), access, user } as any; return { access, user } as any; }
