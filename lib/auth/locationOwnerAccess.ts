import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAdminRole, normalizeRole, type AdminRole } from "@/lib/users/roles";

export type LocationPermission =
  | "location.view"
  | "location.edit"
  | "menu.view"
  | "menu.edit"
  | "marketing.view"
  | "marketing.edit"
  | "recommendations.view"
  | "recommendations.apply"
  | "photos.view"
  | "photos.upload";

export type LocationAccessSource =
  | "superadmin"
  | "admin"
  | "owner"
  | "location_admin"
  | "view_only"
  | "demo"
  | "public"
  | "none";

export type LocationAccessContext = {
  userId: string | null;
  userEmail?: string | null;
  locationId: string;
  canonicalLocationId: string | null;
  locationType?: "restaurant" | "activity" | "location" | "unknown";
  location?: Record<string, unknown> | null;
  isAuthenticated: boolean;
  isSuperadmin: boolean;
  isAdmin: boolean;
  isDemoLocation: boolean;
  isDemoPreview: boolean;
  isOwner: boolean;
  isLocationAdmin: boolean;
  isViewOnly: boolean;
  canView: boolean;
  canEdit: boolean;
  permissions: LocationPermission[];
  source: LocationAccessSource;
};

const VIEW_PERMISSIONS: LocationPermission[] = [
  "location.view",
  "menu.view",
  "marketing.view",
  "recommendations.view",
  "photos.view",
];

const EDIT_PERMISSIONS: LocationPermission[] = [
  ...VIEW_PERMISSIONS,
  "location.edit",
  "menu.edit",
  "marketing.edit",
  "recommendations.apply",
  "photos.upload",
];

function uniquePermissions(values: LocationPermission[]) {
  return Array.from(new Set(values));
}

export type OwnerAccess = {
  isAdmin: boolean;
  isSuperadmin: boolean;
  adminRole?: AdminRole | null;
  adminCanEdit?: boolean;
  ownedLocationIds: string[];
  ownedSourceLocationIds: string[];
};

export function hasOwnerAccessToLocation(
  access: OwnerAccess,
  location:
    | {
        id?: string | null;
        source_id?: string | null;
        source_location_id?: string | null;
      }
    | null
    | undefined,
) {
  if (access.isAdmin) return true;
  if (!location) return false;
  const canonicalId = typeof location.id === "string" ? location.id : null;
  const sourceId =
    typeof location.source_id === "string"
      ? location.source_id
      : typeof location.source_location_id === "string"
        ? location.source_location_id
        : null;
  return Boolean(
    (canonicalId &&
      (access.ownedLocationIds.includes(canonicalId) ||
        access.ownedSourceLocationIds.includes(canonicalId))) ||
    (sourceId &&
      (access.ownedSourceLocationIds.includes(sourceId) ||
        access.ownedLocationIds.includes(sourceId))),
  );
}

const ADMIN_EDIT_ROLES = new Set(["superadmin", "admin", "manager", "editor"]);

async function getAuthenticatedUserAdminHints(userId: string) {
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    const user = data?.user as any;
    return {
      email: typeof user?.email === "string" ? user.email : null,
      role:
        user?.app_metadata?.role ??
        user?.user_metadata?.role ??
        user?.app_metadata?.admin_role ??
        user?.user_metadata?.admin_role ??
        null,
    };
  } catch {
    return { email: null, role: null };
  }
}

async function getAdminFlags(userId: string, userEmail?: string | null) {
  const roleCandidates: unknown[] = [];
  const emailCandidates = new Set<string>();
  if (userEmail) emailCandidates.add(userEmail.toLowerCase());
  const authHints = await getAuthenticatedUserAdminHints(userId);
  if (authHints.email) emailCandidates.add(authHints.email.toLowerCase());
  roleCandidates.push(authHints.role);

  const { data: adminUser } = await supabaseAdmin
    .from("admin_users")
    .select("role,email")
    .eq("user_id", userId)
    .maybeSingle();
  roleCandidates.push(adminUser?.role);
  if (typeof adminUser?.email === "string") {
    emailCandidates.add(adminUser.email.toLowerCase());
  }

  for (const email of emailCandidates) {
    const { data, error } = await supabaseAdmin
      .from("admin_users")
      .select("role,user_id,email")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (error) continue;
    roleCandidates.push(data?.role);
    if (data?.role && data?.user_id !== userId) {
      await supabaseAdmin
        .from("admin_users")
        .update({ user_id: userId })
        .ilike("email", email)
        .is("user_id", null);
    }
  }

  for (const lookup of [
    { table: "users", column: "id" },
    { table: "profiles", column: "id" },
    { table: "user_profiles", column: "id" },
    { table: "user_profiles", column: "user_id" },
  ]) {
    const { data, error } = await supabaseAdmin
      .from(lookup.table)
      .select("role,email")
      .eq(lookup.column, userId)
      .maybeSingle();
    if (!error) {
      roleCandidates.push(data?.role);
      if (typeof data?.email === "string") emailCandidates.add(data.email.toLowerCase());
    }
  }

  for (const email of emailCandidates) {
    for (const lookup of [
      { table: "users", column: "email" },
      { table: "profiles", column: "email" },
      { table: "user_profiles", column: "email" },
    ]) {
      const query = supabaseAdmin
        .from(lookup.table)
        .select("role");
      const { data, error } = await (lookup.column === "email"
        ? query.ilike(lookup.column, email)
        : query.eq(lookup.column, email)
      )
        .limit(1)
        .maybeSingle();
      if (!error) roleCandidates.push(data?.role);
    }
  }

  const normalizedRoles = roleCandidates
    .map((role) =>
      normalizeRole(typeof role === "string" ? role.trim().toLowerCase() : null),
    )
    .filter(Boolean) as string[];
  const adminRole =
    (normalizedRoles.find((role) => role === "superadmin") ??
      normalizedRoles.find((role) => isAdminRole(role))) as AdminRole | null;
  const isAdmin = Boolean(adminRole);
  const isSuperadmin = adminRole === "superadmin";
  const adminCanEdit = Boolean(adminRole && ADMIN_EDIT_ROLES.has(adminRole));
  return { isAdmin, isSuperadmin, adminRole, adminCanEdit };
}

export async function getLocationOwnerAccess(
  userId: string,
  userEmail?: string | null,
): Promise<OwnerAccess> {
  const { isAdmin, isSuperadmin, adminRole, adminCanEdit } = await getAdminFlags(userId, userEmail);
  const ownedLocationIds = new Set<string>();
  const ownedSourceLocationIds = new Set<string>();
  const [{ data: claims }, { data: mappings }, { data: directOwned }] =
    await Promise.all([
      supabaseAdmin
        .from("business_claims")
        .select("location_id,source_location_id")
        .eq("user_id", userId)
        .eq("status", "approved"),
      supabaseAdmin
        .from("location_owner_locations")
        .select("location_id,source_location_id")
        .eq("user_id", userId)
        .eq("status", "active"),
      supabaseAdmin
        .from("locations")
        .select("id,source_id,claim_status,is_claimed,claimed")
        .eq("owner_user_id", userId)
        .in("claim_status", ["approved", "claimed", "redeemed"]),
    ]);
  for (const row of claims ?? []) {
    if (typeof row.location_id === "string")
      ownedLocationIds.add(row.location_id);
    if (typeof row.source_location_id === "string")
      ownedSourceLocationIds.add(row.source_location_id);
  }
  for (const row of mappings ?? []) {
    if (typeof row.location_id === "string")
      ownedLocationIds.add(row.location_id);
    if (typeof row.source_location_id === "string")
      ownedSourceLocationIds.add(row.source_location_id);
  }
  for (const row of directOwned ?? []) {
    if (typeof row.id === "string") ownedLocationIds.add(row.id);
    if (typeof row.source_id === "string")
      ownedSourceLocationIds.add(row.source_id);
  }
  return {
    isAdmin,
    isSuperadmin,
    adminRole,
    adminCanEdit,
    ownedLocationIds: Array.from(ownedLocationIds),
    ownedSourceLocationIds: Array.from(ownedSourceLocationIds),
  };
}

export type OwnerLocationAccessResult = {
  userId: string;
  access: OwnerAccess;
  location: Record<string, any>;
};
export function sanitizeOwnerLocationResponse(
  row: Record<string, any> | null | undefined,
) {
  if (!row) return null;
  const allowed = [
    "id",
    "source_id",
    "source_location_id",
    "source_table",
    "name",
    "location_name",
    "restaurant_name",
    "activity_name",
    "address",
    "city",
    "state",
    "zip",
    "phone",
    "website",
    "instagram",
    "category",
    "cuisine_type",
    "activity_type",
    "description",
    "hours",
    "operating_hours",
    "reservation_url",
    "subscription_plan",
    "subscription_status",
    "plan",
    "is_pro",
    "updated_at",
  ];
  return Object.fromEntries(
    allowed.filter((key) => key in row).map((key) => [key, row[key]]),
  );
}

export async function requireOwnerAccessToLocation(
  userId: string,
  locationId: string,
): Promise<OwnerLocationAccessResult | null> {
  const cleanLocationId = cleanId(locationId);
  if (!userId || !cleanLocationId) return null;
  const access = await getLocationOwnerAccess(userId);
  const location = await findCanonicalLocationForEditableContext({
    userId,
    locationId: cleanLocationId,
  });
  if (!location || !hasOwnerAccessToLocation(access, location)) return null;
  return { userId, access, location: location as Record<string, any> };
}
export async function requireOwnerOrAdminAccessToLocation(
  userId: string,
  locationId: string,
): Promise<OwnerLocationAccessResult | null> {
  const cleanLocationId = cleanId(locationId);
  if (!userId || !cleanLocationId) return null;
  const access = await getLocationOwnerAccess(userId);
  const location = await findCanonicalLocationForEditableContext({
    userId,
    locationId: cleanLocationId,
  });
  if (!location) return null;
  if (access.isAdmin || hasOwnerAccessToLocation(access, location))
    return { userId, access, location: location as Record<string, any> };
  return null;
}

export type EditableLocationContextInput = {
  userId: string;
  locationId?: string | null;
  adminLocationId?: string | null;
  demoLocationId?: string | null;
  sourceId?: string | null;
  type?: string | null;
  demo?: boolean;
  fromDemoCenter?: boolean;
  userEmail?: string | null;
};
export type EditableLocationContext = {
  userId: string;
  canonicalLocationId: string;
  location: Record<string, any>;
  access: OwnerAccess;
  isAdmin: boolean;
  isDemoMode: boolean;
  canView: boolean;
  canEdit: boolean;
  source: LocationAccessSource;
  locationAccess: LocationAccessContext;
};

function cleanId(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}
function sourceTableVariants(type?: string | null) {
  if (type === "activities" || type === "activity")
    return ["activities", "activity"];
  if (type === "restaurants" || type === "restaurant")
    return ["restaurants", "restaurant"];
  return ["restaurants", "restaurant", "activities", "activity"];
}
function normalizeLocationType(
  location: Record<string, unknown> | null | undefined,
): LocationAccessContext["locationType"] {
  const raw = String(
    location?.location_type ?? location?.source_table ?? "",
  ).toLowerCase();
  if (raw.includes("restaurant")) return "restaurant";
  if (raw.includes("activit")) return "activity";
  if (location?.id) return "location";
  return "unknown";
}

async function findCanonicalLocationForEditableContext(
  input: EditableLocationContextInput,
) {
  const ids = [
    input.adminLocationId,
    input.demoLocationId,
    input.locationId,
    input.sourceId,
  ]
    .map(cleanId)
    .filter(Boolean) as string[];
  const uniqueIds = Array.from(new Set(ids));
  if (!uniqueIds.length) return null;
  for (const id of uniqueIds) {
    const { data } = await supabaseAdmin
      .from("locations")
      .select("*")
      .or(`id.eq.${id},source_id.eq.${id},source_location_id.eq.${id}`)
      .maybeSingle();
    if (data) return data as Record<string, any>;
  }
  for (const table of sourceTableVariants(input.type))
    for (const id of uniqueIds) {
      const { data: legacy } = await supabaseAdmin
        .from(table)
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (!legacy?.id) continue;
      const { data } = await supabaseAdmin
        .from("locations")
        .select("*")
        .eq("source_table", table)
        .eq("source_id", String(legacy.id))
        .maybeSingle();
      if (data) return data as Record<string, any>;
    }
  return null;
}

async function getLocationTeamAccess(
  userId: string,
  email: string | null | undefined,
  locationId: string,
) {
  const filters = [`user_id.eq.${userId}`];
  if (email) filters.push(`email.eq.${email}`);
  const { data, error } = await supabaseAdmin
    .from("location_team_members")
    .select("role,permissions,invitation_status")
    .eq("location_id", locationId)
    .or(filters.join(","))
    .in("invitation_status", ["accepted", "active"])
    .limit(1);
  if (error) return null;
  const row = data?.[0] as any;
  if (!row) return null;
  const role = String(row.role || "view_only");
  const custom =
    row.permissions && typeof row.permissions === "object"
      ? (row.permissions as Record<string, unknown>)
      : {};
  const base =
    role === "view_only"
      ? VIEW_PERMISSIONS
      : role === "location_admin" || role === "manager"
        ? EDIT_PERMISSIONS
        : VIEW_PERMISSIONS;
  const permissions = new Set<LocationPermission>(base);
  for (const permission of EDIT_PERMISSIONS)
    if (custom[permission] === true) permissions.add(permission);
    else if (custom[permission] === false) permissions.delete(permission);
  if (role === "view_only")
    for (const permission of EDIT_PERMISSIONS.filter(
      (p) => !VIEW_PERMISSIONS.includes(p),
    ))
      permissions.delete(permission);
  return { role, permissions: Array.from(permissions) };
}

export type ResolveLocationAccessContextInput = Omit<
  EditableLocationContextInput,
  "userId"
> & {
  userId?: string | null;
  userEmail?: string | null;
  request?: Request;
  allowDemoPreview?: boolean;
};

export async function resolveLocationAccessContext(
  input: ResolveLocationAccessContextInput,
): Promise<LocationAccessContext> {
  let userId = cleanId(input.userId);
  let userEmail = input.userEmail ?? null;
  if (!userId && input.request) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    userEmail = user?.email ?? null;
  }
  let impersonatedLocationId: string | null = null;
  try {
    const cookieStore = await cookies();
    impersonatedLocationId = cleanId(
      cookieStore.get("theouthaven_impersonate_location_id")?.value,
    );
  } catch {
    impersonatedLocationId = null;
  }
  const requestedId =
    cleanId(
      input.locationId ??
        input.adminLocationId ??
        input.demoLocationId ??
        input.sourceId ??
        impersonatedLocationId,
    ) || "";
  const location = await findCanonicalLocationForEditableContext({
    ...input,
    locationId: input.locationId ?? impersonatedLocationId,
    userId: userId || "",
  });
  const canonicalLocationId = location?.id ? String(location.id) : null;
  const base = {
    userId,
    userEmail,
    locationId: requestedId,
    canonicalLocationId,
    locationType: normalizeLocationType(location),
    location: location ?? null,
    isAuthenticated: Boolean(userId),
    isSuperadmin: false,
    isAdmin: false,
    isDemoLocation: false,
    isDemoPreview: Boolean(input.demo || input.fromDemoCenter),
    isOwner: false,
    isLocationAdmin: false,
    isViewOnly: false,
  };
  if (!userId || !location?.id)
    return {
      ...base,
      canView: false,
      canEdit: false,
      permissions: [],
      source: userId ? "none" : "public",
    };
  const access = await getLocationOwnerAccess(userId, userEmail);
  const isDemoPreview = Boolean(
    input.allowDemoPreview && (input.demo || input.fromDemoCenter),
  );
  if (access.isAdmin) {
    const source: LocationAccessSource = isDemoPreview
      ? "demo"
      : access.isSuperadmin
        ? "superadmin"
        : "admin";
    const adminCanEdit = access.adminCanEdit !== false;
    return {
      ...base,
      isAdmin: true,
      isSuperadmin: access.isSuperadmin,
      isDemoLocation: isDemoPreview,
      isDemoPreview,
      canView: true,
      canEdit: adminCanEdit,
      permissions: uniquePermissions(adminCanEdit ? EDIT_PERMISSIONS : VIEW_PERMISSIONS),
      source,
    };
  }
  const isOwner = hasOwnerAccessToLocation(access, location);
  if (isOwner)
    return {
      ...base,
      isOwner: true,
      canView: true,
      canEdit: true,
      permissions: uniquePermissions(EDIT_PERMISSIONS),
      source: "owner",
    };
  const team = await getLocationTeamAccess(
    userId,
    userEmail,
    String(location.id),
  );
  if (team) {
    const canEdit = team.permissions.some((p) => !VIEW_PERMISSIONS.includes(p));
    return {
      ...base,
      isLocationAdmin: canEdit,
      isViewOnly: !canEdit,
      canView: team.permissions.includes("location.view"),
      canEdit,
      permissions: uniquePermissions(team.permissions),
      source: canEdit ? "location_admin" : "view_only",
    };
  }
  return {
    ...base,
    canView: false,
    canEdit: false,
    permissions: [],
    source: "none",
  };
}

export function hasLocationPermission(
  access: LocationAccessContext | null | undefined,
  permission: LocationPermission,
) {
  return Boolean(access?.permissions.includes(permission));
}
export function locationAccessErrorResponse(
  message = "You do not have permission to access this location.",
  status: 400 | 401 | 403 = 403,
) {
  return Response.json(
    { success: false, ok: false, error: message },
    { status },
  );
}
export async function requireLocationPermission(
  input: ResolveLocationAccessContextInput & { permission: LocationPermission },
) {
  const access = await resolveLocationAccessContext(input);
  if (!access.locationId)
    return {
      access,
      error: locationAccessErrorResponse("Missing locationId.", 400),
    };
  if (!hasLocationPermission(access, input.permission))
    return {
      access,
      error: locationAccessErrorResponse(
        "You do not have permission to access this location.",
        403,
      ),
    };
  return { access, error: null as Response | null };
}

export async function resolveEditableLocationContext(
  input: EditableLocationContextInput,
): Promise<EditableLocationContext | null> {
  if (!input.userId) return null;
  const locationAccess = await resolveLocationAccessContext({
    ...input,
    allowDemoPreview: true,
  });
  if (!locationAccess.location?.id || !locationAccess.canEdit) return null;
  const access = await getLocationOwnerAccess(input.userId, input.userEmail);
  return {
    userId: input.userId,
    canonicalLocationId: String(locationAccess.location.id),
    location: locationAccess.location as Record<string, any>,
    access,
    isAdmin: locationAccess.isAdmin,
    isDemoMode: Boolean(input.demo || input.fromDemoCenter),
    canView: locationAccess.canView,
    canEdit: locationAccess.canEdit,
    source: locationAccess.source,
    locationAccess,
  };
}
