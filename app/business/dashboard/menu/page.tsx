import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import { requireLocationPermission } from "@/lib/location-access";
import { getPublicLocationMenuHref } from "@/lib/locations/public-location-url";
import { menuResponseShape } from "@/lib/business/menu-validation";
import MenuEditorClient from "./MenuEditorClient";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) || {};
  const explicit = String(params.locationId || params.adminLocationId || params.demoLocationId || "");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  let locationId = explicit;
  if (!locationId) {
    const access = await getLocationOwnerAccess(user.id);
    locationId = access.ownedLocationIds[0] || access.ownedSourceLocationIds[0] || "";
  }
  if (!locationId) redirect("/business/dashboard");
  const { context: access, error } = await requireLocationPermission({ searchParams: params, locationId, requiredPermission: "menu.view", allowDemoPreview: true });
  if (error || !access.location) redirect("/business/dashboard");
  const canonicalId = String(access.location.id || locationId);
  const page = (await supabaseAdmin.from("location_commerce_pages").select("*").eq("location_id", canonicalId).eq("page_type", "menu").limit(1).maybeSingle()).data;
  const [{ data: sections }, { data: items }] = await Promise.all([
    supabaseAdmin.from("location_commerce_sections").select("*").eq("location_id", canonicalId).eq("commerce_page_id", page?.id || "__none__").order("sort_order"),
    supabaseAdmin.from("location_commerce_items").select("*").eq("location_id", canonicalId).eq("commerce_page_id", page?.id || "__none__").order("sort_order"),
  ]);
  const initialData = menuResponseShape({ location: access.location, page, sections: sections || [], items: items || [], previewUrl: getPublicLocationMenuHref(access.location), permissions: { canEdit: access.canEdit } });
  const contextKey = params.adminLocationId ? "adminLocationId" : params.demoLocationId ? "demoLocationId" : "locationId";
  return <MenuEditorClient initialData={initialData} locationId={canonicalId} contextKey={contextKey as any} />;
}
