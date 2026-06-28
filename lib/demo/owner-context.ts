import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MIRROR_DEMO_KEY } from "@/lib/demo/demo-center";

export type DemoSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
export function getDemoOwnerSearchParams(location: { id: string; location_type?: string | null; type?: string | null; primary_category?: string | null }) {
  const type = String(location.location_type || location.type || location.primary_category || "restaurant").toLowerCase().includes("activ") ? "activity" : "restaurant";
  return new URLSearchParams({ adminLocationId: location.id, locationId: location.id, type, demo: "1", fromDemoCenter: "1" });
}
export function buildDemoOwnerHref(path: string, location?: { id?: string | null; location_type?: string | null; type?: string | null; primary_category?: string | null } | null) {
  if (!location?.id) return undefined;
  return `${path}?${getDemoOwnerSearchParams({ ...location, id: location.id }).toString()}`;
}
export function parseDemoOwnerParams(params?: DemoSearchParams | null) {
  const demo = first(params?.demo) === "1" || first(params?.fromDemoCenter) === "1" || Boolean(first(params?.adminLocationId));
  const locationId = first(params?.adminLocationId) || first(params?.locationId);
  const type = first(params?.type) || "restaurant";
  return { demo, locationId, type, fromDemoCenter: first(params?.fromDemoCenter) === "1" };
}
export async function requireDemoOwnerLocation(params?: DemoSearchParams | null) {
  const parsed = parseDemoOwnerParams(params);
  if (!parsed.demo || !parsed.locationId) return { ...parsed, location: null, demoMode: false };
  await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);
  const { data: location } = await supabaseAdmin.from("locations").select("*").eq("id", parsed.locationId).maybeSingle();
  const metadata = (location as any)?.metadata || {};
  if (!location || ((location as any).demo_key !== MIRROR_DEMO_KEY && metadata.demo_key !== MIRROR_DEMO_KEY)) redirect("/admin/unauthorized");
  return { ...parsed, location, demoMode: true };
}
