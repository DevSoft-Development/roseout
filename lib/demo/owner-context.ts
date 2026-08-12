import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  DEMO_LOCATION_NAME,
  MIRROR_DEMO_KEY,
  getDemoCenterOverview,
} from "@/lib/demo/demo-center";
import { getInternalDemoViewer } from "@/lib/demo/internal-demo-access";

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
  const demo = first(params?.demo) === "1" || first(params?.fromDemoCenter) === "1";
  const adminLocationMode = first(params?.adminLocationMode) === "1" || Boolean(first(params?.adminLocationId));
  const locationId = first(params?.adminLocationId) || first(params?.locationId);
  const type = first(params?.type) || "restaurant";
  return {
    demo,
    locationId,
    type,
    fromDemoCenter: first(params?.fromDemoCenter) === "1",
    adminLocationMode,
  };
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
    return { ...parsed, location: null, demoMode: false, adminLocationMode: false };
  }

  const [internalViewer, overview] = await Promise.all([
    parsed.demo ? getInternalDemoViewer().catch(() => null) : Promise.resolve(null),
    parsed.demo ? getDemoCenterOverview().catch(() => null) : Promise.resolve(null),
  ]);
  const requestedLocationId = parsed.locationId || overview?.location?.id || "";

  if (!requestedLocationId) {
    return {
      ...parsed,
      locationId: "",
      location: null,
      demoMode: parsed.demo,
      adminLocationMode: parsed.adminLocationMode,
    };
  }

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", requestedLocationId)
    .maybeSingle();

  if (parsed.demo) {
    const safeMirror = isMirrorDemoLocation(location, overview?.location);
    const safetyContract = Boolean(
      location &&
        location.demo_key === MIRROR_DEMO_KEY &&
        location.is_demo === true &&
        location.is_hidden === true &&
        location.is_searchable !== true,
    );

    if (internalViewer && safeMirror && safetyContract) {
      return {
        ...parsed,
        locationId: requestedLocationId,
        location,
        demoMode: true,
        adminLocationMode: false,
        internalDemoRole: internalViewer.role,
      };
    }

    return {
      ...parsed,
      locationId: requestedLocationId,
      location: null,
      demoMode: true,
      adminLocationMode: false,
    };
  }

  // Non-demo admin-location context continues through the normal business/owner
  // permission checks on the destination page/API. This helper must not turn an
  // arbitrary adminLocationId query parameter into implicit access.
  return {
    ...parsed,
    locationId: requestedLocationId,
    location: null,
    demoMode: false,
    adminLocationMode: parsed.adminLocationMode,
  };
}
