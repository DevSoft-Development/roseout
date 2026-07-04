import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess, hasOwnerAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { permissionsForAccess, hasLocationPermission } from "./permissions";
import type { LocationAccessContext, LocationPermission, ResolveLocationAccessOptions } from "./types";

function clean(value: unknown) { const text = String(value ?? "").trim(); return text || null; }
function flag(value: unknown) { return value === true || value === "1" || value === "true"; }
function pick(options: ResolveLocationAccessOptions, key: string): unknown {
  const bodyValue = options.body?.[key]; if (bodyValue !== undefined) return bodyValue;
  const sp = options.searchParams;
  if (sp instanceof URLSearchParams) return sp.get(key);
  if (sp && key in sp) { const value = sp[key]; return Array.isArray(value) ? value[0] : value; }
  if (options.request) return new URL(options.request.url).searchParams.get(key);
  return undefined;
}
function typeOfLocation(location: Record<string, unknown> | null | undefined, input?: string | null): LocationAccessContext["locationType"] {
  const raw = String(input || location?.location_type || location?.type || location?.source_table || "").toLowerCase();
  if (raw.includes("restaurant")) return "restaurant";
  if (raw.includes("activit")) return "activity";
  if (raw) return "location";
  return "unknown";
}
async function findLocation(ids: (string | null)[], type?: string | null) {
  for (const id of Array.from(new Set(ids.filter(Boolean))) as string[]) {
    const { data } = await supabaseAdmin.from("locations").select("*").or(`id.eq.${id},source_id.eq.${id},source_location_id.eq.${id}`).maybeSingle();
    if (data) return data as Record<string, unknown>;
  }
  return null;
}
async function findTeamMember(user: { id?: string; email?: string | null } | null, locationId: string) {
  if (!user?.id && !user?.email) return null;
  try {
    const email = String(user.email || "").toLowerCase();
    let q = supabaseAdmin.from("location_team_members").select("*").eq("location_id", locationId).in("invitation_status", ["pending", "active", "accepted"]).limit(1);
    q = user.id ? q.or(`user_id.eq.${user.id},email.eq.${email}`) : q.eq("email", email);
    const { data } = await q;
    return data?.[0] || null;
  } catch { return null; }
}

export async function resolveLocationAccessContext(options: ResolveLocationAccessOptions): Promise<LocationAccessContext> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const location = await findLocation([
    clean(options.adminLocationId ?? pick(options, "adminLocationId")),
    clean(options.demoLocationId ?? pick(options, "demoLocationId")),
    clean(options.locationId ?? pick(options, "locationId")),
    clean(options.sourceId ?? pick(options, "sourceId")),
  ], options.locationType || options.type || clean(pick(options, "type")));
  const locationId = String(location?.id || clean(options.locationId ?? pick(options, "locationId")) || "");
  const demoRequested = flag(pick(options, "demo")) || flag(pick(options, "fromDemoCenter"));
  const base = { userId: user?.id ?? null, userEmail: user?.email ?? null, locationId, locationType: typeOfLocation(location, options.locationType || options.type || clean(pick(options, "type"))), location: location || null, isAuthenticated: Boolean(user), isSuperadmin: false, isAdmin: false, isDemoLocation: demoRequested, isDemoPreview: false, isOwner: false, isLocationAdmin: false, isViewOnly: false, canView: false, canEdit: false, permissions: [] as LocationPermission[], source: "none" as const };
  if (!user?.id || !location?.id) return base;

  const ownerAccess = await getLocationOwnerAccess(user.id);
  const isSuperadmin = ownerAccess.isSuperadmin;
  const isAdmin = ownerAccess.isAdmin;
  const isOwner = hasOwnerAccessToLocation(ownerAccess, location as any) && !isAdmin;
  const teamMember = await findTeamMember(user, String(location.id));
  const memberRole = String(teamMember?.role || "");
  const isLocationAdmin = ["location_admin", "manager", "marketing"].includes(memberRole);
  const isViewOnly = memberRole === "view_only";
  const adminCanEdit = isAdmin;
  const ownerCanEdit = isOwner;
  const teamCanEdit = isLocationAdmin && !isViewOnly;
  const canEdit = adminCanEdit || ownerCanEdit || teamCanEdit;
  const canView = canEdit || isViewOnly || Boolean(teamMember);
  const source = isSuperadmin ? "superadmin" : isAdmin ? (demoRequested ? "demo" : "admin") : isOwner ? "owner" : isLocationAdmin ? "location_admin" : isViewOnly ? "view_only" : canView ? "view_only" : "none";
  const ctx: LocationAccessContext = { ...base, isSuperadmin, isAdmin, isDemoPreview: demoRequested && isAdmin, isOwner, isLocationAdmin, isViewOnly, canView, canEdit, permissions: permissionsForAccess(canEdit), source };
  return ctx;
}

export async function requireLocationPermission(options: ResolveLocationAccessOptions & { requiredPermission: LocationPermission }) {
  const ctx = await resolveLocationAccessContext(options);
  if (!hasLocationPermission(ctx, options.requiredPermission)) return { context: ctx, error: locationAccessErrorResponse(ctx, options.requiredPermission) };
  return { context: ctx, error: null };
}

export function locationAccessErrorResponse(ctx: LocationAccessContext, permission?: LocationPermission) {
  if (!ctx.isAuthenticated) return NextResponse.json({ ok: false, message: "Please sign in to continue." }, { status: 401 });
  if (!ctx.location) return NextResponse.json({ ok: false, message: "We could not find that location." }, { status: 404 });
  const edit = permission?.endsWith(".edit") || permission?.endsWith(".apply") || permission?.endsWith(".upload") || permission === "location.edit";
  return NextResponse.json({ ok: false, message: edit ? "You can view this location, but you do not have permission to make changes." : "You do not have access to this location." }, { status: 403 });
}
