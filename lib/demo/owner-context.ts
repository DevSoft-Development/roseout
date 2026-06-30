import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  DEMO_LOCATION_NAME,
  MIRROR_DEMO_KEY,
  getDemoCenterOverview,
} from "@/lib/demo/demo-center";
import { isAdminRole, normalizeRole } from "@/lib/users/roles";

export type DemoSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
export function getDemoOwnerSearchParams(location: {
  id: string;
  location_type?: string | null;
  type?: string | null;
  primary_category?: string | null;
}) {
  const type = String(
    location.location_type ||
      location.type ||
      location.primary_category ||
      "restaurant",
  )
    .toLowerCase()
    .includes("activ")
    ? "activity"
    : "restaurant";
  return new URLSearchParams({
    adminLocationId: location.id,
    locationId: location.id,
    type,
    demo: "1",
    fromDemoCenter: "1",
  });
}
export function buildDemoOwnerHref(
  path: string,
  location?: {
    id?: string | null;
    location_type?: string | null;
    type?: string | null;
    primary_category?: string | null;
  } | null,
) {
  if (!location?.id) return undefined;
  return `${path}?${getDemoOwnerSearchParams({ ...location, id: location.id }).toString()}`;
}
export function parseDemoOwnerParams(params?: DemoSearchParams | null) {
  const demo = first(params?.demo) === "1" || first(params?.fromDemoCenter) === "1" || Boolean(first(params?.adminLocationId));
  const locationId = first(params?.adminLocationId) || first(params?.locationId);
  const type = first(params?.type) || "restaurant";
  return {
    demo,
    locationId,
    type,
    fromDemoCenter: first(params?.fromDemoCenter) === "1",
  };
}
async function hasAdminSession() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) return false;

    const { data: adminUser } = await supabaseAdmin
      .from("admin_users")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    return isAdminRole(normalizeRole(adminUser?.role));
  } catch {
    return false;
  }
}

function isMirrorDemoLocation(location: any, overviewLocation: any = null) {
  if (!location) return false;
  const metadata = location.metadata || {};
  const names = [
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.location_name,
  ].map((value) => String(value || "").trim());

  return (
    location.id === overviewLocation?.id ||
    location.demo_key === MIRROR_DEMO_KEY ||
    metadata.demo_key === MIRROR_DEMO_KEY ||
    names.includes(DEMO_LOCATION_NAME) ||
    (overviewLocation &&
      names.some(
        (name) =>
          name &&
          name ===
            String(
              overviewLocation.name ||
                overviewLocation.restaurant_name ||
                overviewLocation.activity_name ||
                "",
            ),
      ))
  );
}

export async function requireDemoOwnerLocation(
  params?: DemoSearchParams | null,
) {
  const parsed = parseDemoOwnerParams(params);
  if (!parsed.demo && !parsed.locationId) {
    return { ...parsed, location: null, demoMode: false };
  }

  const [adminSession, overview] = await Promise.all([
    hasAdminSession(),
    getDemoCenterOverview().catch(() => null),
  ]);
  const requestedLocationId = parsed.locationId || overview?.location?.id || "";

  if (!requestedLocationId) {
    return { ...parsed, locationId: "", location: null, demoMode: true };
  }

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", requestedLocationId)
    .maybeSingle();

  if (adminSession && location) {
    return {
      ...parsed,
      locationId: requestedLocationId,
      location,
      demoMode: true,
    };
  }

  if (isMirrorDemoLocation(location, overview?.location)) {
    return {
      ...parsed,
      locationId: requestedLocationId,
      location,
      demoMode: true,
    };
  }

  return {
    ...parsed,
    locationId: requestedLocationId,
    location: null,
    demoMode: true,
  };
}
