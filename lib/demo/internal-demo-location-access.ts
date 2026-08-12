import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { MIRROR_DEMO_KEY } from "@/lib/demo/demo-center";
import { getInternalDemoViewer } from "@/lib/demo/internal-demo-access";

export type InternalDemoLocationAccess = {
  viewer: NonNullable<Awaited<ReturnType<typeof getInternalDemoViewer>>>;
  location: Record<string, any>;
  locationId: string;
};

function toBoolean(value: unknown) {
  return value === true || value === "1" || value === "true";
}

export async function getInternalDemoLocationAccess(input: {
  locationId?: unknown;
  adminLocationId?: unknown;
  demoLocationId?: unknown;
  demo?: unknown;
  fromDemoCenter?: unknown;
}): Promise<InternalDemoLocationAccess | null> {
  const demoContext = toBoolean(input.demo) || toBoolean(input.fromDemoCenter);
  if (!demoContext) return null;

  const locationId = String(
    input.demoLocationId || input.adminLocationId || input.locationId || "",
  ).trim();
  if (!locationId) return null;

  const viewer = await getInternalDemoViewer();
  if (!viewer) return null;

  const { data: location, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", locationId)
    .maybeSingle();

  if (
    error ||
    !location?.id ||
    location.demo_key !== MIRROR_DEMO_KEY ||
    location.is_demo !== true ||
    location.is_hidden !== true ||
    location.is_searchable === true ||
    location.demo_visible_publicly === true ||
    location.publish_ready === true
  ) {
    return null;
  }

  return { viewer, location, locationId: String(location.id) };
}
