import type { User } from "@supabase/supabase-js";
import { normalizeRole } from "@/lib/users/roles";
import { sanitizeIntendedPath } from "@/lib/auth-redirect";

type QueryResult<T> = { data: T | T[] | null; error: unknown };

type SupabaseQuery = {
  select: (columns: string) => SupabaseQuery;
  eq: (column: string, value: string) => SupabaseQuery;
  in: (column: string, values: string[]) => SupabaseQuery;
  limit: (count: number) => PromiseLike<QueryResult<unknown>>;
  maybeSingle: () => PromiseLike<QueryResult<unknown>>;
  then: PromiseLike<QueryResult<unknown>>["then"];
};

type SupabaseTable = {
  select: (columns: string) => SupabaseQuery;
};

export type SupabaseLike = {
  from: (table: string) => SupabaseTable;
};

type LoginUser = Pick<User, "id" | "email"> | null | undefined;

const ADMIN_DESTINATION = "/admin/dashboard";
const OWNER_DESTINATION = "/location-owner/dashboard";
const USER_DESTINATION = "/create";
const ADMIN_LOGIN_ROLES = new Set(["superadmin", "admin"]);
const OWNER_STATUSES = ["verified", "approved", "active"];

async function maybeSingleData<T>(query: SupabaseQuery): Promise<T | null> {
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return (data ?? null) as T | null;
}

async function listData<T>(query: PromiseLike<QueryResult<unknown>>): Promise<T[]> {
  const { data, error } = await query;
  if (error || !Array.isArray(data)) return [];
  return data as T[];
}

export async function getAdminLoginRole(
  supabase: SupabaseLike,
  user: LoginUser,
): Promise<string | null> {
  if (!user) return null;
  const email = user.email?.trim().toLowerCase() || null;

  const byUserId = await maybeSingleData<{ role?: string | null }>(
    supabase.from("admin_users").select("role").eq("user_id", user.id),
  );
  const byEmail = byUserId
    ? null
    : email
      ? await maybeSingleData<{ role?: string | null }>(
          supabase.from("admin_users").select("role").eq("email", email),
        )
      : null;

  const role = normalizeRole(byUserId?.role ?? byEmail?.role ?? null);
  return ADMIN_LOGIN_ROLES.has(role) ? role : null;
}

export async function hasVerifiedOwnerAccess(
  supabase: SupabaseLike,
  user: LoginUser,
): Promise<boolean> {
  if (!user) return false;
  const email = user.email?.trim().toLowerCase() || "";

  const claimByUser = await listData<{ id: string }>(
    supabase
      .from("business_claims")
      .select("id")
      .eq("user_id", user.id)
      .in("status", OWNER_STATUSES)
      .limit(1),
  );
  if (claimByUser.length > 0) return true;

  if (email) {
    const claimByEmail = await listData<{ id: string }>(
      supabase
        .from("business_claims")
        .select("id")
        .eq("owner_email", email)
        .in("status", OWNER_STATUSES)
        .limit(1),
    );
    if (claimByEmail.length > 0) return true;
  }

  const ownerMapping = await listData<{ id: string }>(
    supabase
      .from("location_owner_locations")
      .select("id")
      .eq("user_id", user.id)
      .in("status", OWNER_STATUSES)
      .limit(1),
  );
  if (ownerMapping.length > 0) return true;

  const directLocation = await listData<{ id: string }>(
    supabase.from("locations").select("id").eq("owner_user_id", user.id).limit(1),
  );
  if (directLocation.length > 0) return true;

  if (email) {
    const locationByOwnerEmail = await listData<{ id: string }>(
      supabase.from("locations").select("id").eq("owner_email", email).limit(1),
    );
    if (locationByOwnerEmail.length > 0) return true;

    const locationByClaimedEmail = await listData<{ id: string }>(
      supabase.from("locations").select("id").eq("claimed_by_email", email).limit(1),
    );
    if (locationByClaimedEmail.length > 0) return true;
  }

  const directRestaurant = await listData<{ id: string }>(
    supabase.from("restaurants").select("id").eq("owner_user_id", user.id).limit(1),
  );
  if (directRestaurant.length > 0) return true;

  if (email) {
    const restaurantByOwnerEmail = await listData<{ id: string }>(
      supabase.from("restaurants").select("id").eq("owner_email", email).limit(1),
    );
    if (restaurantByOwnerEmail.length > 0) return true;
  }

  return false;
}

export async function getLoginDestination(
  supabase: SupabaseLike,
  user: LoginUser,
  intendedPath?: string | null,
): Promise<string> {
  if (!user) return "/login";

  const adminRole = await getAdminLoginRole(supabase, user);
  if (adminRole) return ADMIN_DESTINATION;

  const isOwner = await hasVerifiedOwnerAccess(supabase, user);
  if (isOwner) return OWNER_DESTINATION;

  return sanitizeIntendedPath(intendedPath) || USER_DESTINATION;
}
