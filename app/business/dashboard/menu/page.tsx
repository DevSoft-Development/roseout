import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess, resolveEditableLocationContext } from "@/lib/auth/locationOwnerAccess";
import { getEditableLocationMenu } from "@/lib/locations/menu";
import MenuEditorClient from "./MenuEditorClient";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) || {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  let locationId = first(params.locationId) || first(params.adminLocationId) || first(params.demoLocationId) || "";
  if (!locationId) {
    const access = await getLocationOwnerAccess(user.id);
    locationId = access.ownedLocationIds[0] || access.ownedSourceLocationIds[0] || "";
  }
  if (!locationId) redirect("/business/dashboard");
  const access = await resolveEditableLocationContext({ userId: user.id, locationId, adminLocationId: first(params.adminLocationId), demoLocationId: first(params.demoLocationId), sourceId: first(params.sourceId), type: first(params.type), demo: first(params.demo) === "1", fromDemoCenter: first(params.fromDemoCenter) === "1" });
  if (!access) redirect("/business/dashboard");
  const initialData = await getEditableLocationMenu(access.canonicalLocationId, access);
  const contextKey = params.adminLocationId ? "adminLocationId" : params.demoLocationId ? "demoLocationId" : "locationId";
  return <MenuEditorClient initialData={initialData} locationId={access.canonicalLocationId} contextKey={contextKey as any} />;
}
