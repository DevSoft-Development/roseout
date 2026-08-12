import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import {
  getLocationOwnerAccess,
  resolveEditableLocationContext,
} from "@/lib/auth/locationOwnerAccess";
import { getEditableLocationMenu } from "@/lib/locations/menu";
import { getInternalDemoLocationAccess } from "@/lib/demo/internal-demo-location-access";
import MenuEditorClient from "./MenuEditorClient";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) || {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const adminLocationId = first(params.adminLocationId);
  const demoLocationId = first(params.demoLocationId);
  const sourceId = first(params.sourceId);
  const type = first(params.type);
  const demo = first(params.demo) === "1";
  const fromDemoCenter = first(params.fromDemoCenter) === "1";

  const cookieStore = await cookies();
  let locationId =
    first(params.locationId) ||
    adminLocationId ||
    demoLocationId ||
    cookieStore.get("theouthaven_impersonate_location_id")?.value ||
    "";

  if (!locationId) {
    const ownerAccess = await getLocationOwnerAccess(user.id, user.email ?? null);
    locationId =
      ownerAccess.ownedLocationIds[0] || ownerAccess.ownedSourceLocationIds[0] || "";
  }

  if (!locationId) redirect("/business/dashboard");

  const access = await resolveEditableLocationContext({
    userId: user.id,
    userEmail: user.email ?? null,
    locationId,
    adminLocationId,
    demoLocationId,
    sourceId,
    type,
    demo,
    fromDemoCenter,
  });

  const internalDemoAccess = access
    ? null
    : await getInternalDemoLocationAccess({
        locationId,
        adminLocationId,
        demoLocationId,
        demo,
        fromDemoCenter,
      });

  if (!access && !internalDemoAccess) redirect("/business/dashboard");

  const canonicalLocationId = access?.canonicalLocationId || internalDemoAccess!.locationId;
  const menuAccess = access || {
    userId: user.id,
    canonicalLocationId,
    location: internalDemoAccess!.location,
    isAdmin: false,
    isDemoMode: true,
    permissions: { canRead: true, canEdit: true },
  };

  const initialData = await getEditableLocationMenu(canonicalLocationId, menuAccess as any);

  const contextKey = adminLocationId
    ? "adminLocationId"
    : demoLocationId
      ? "demoLocationId"
      : "locationId";

  const contextPayload = {
    locationId: canonicalLocationId,
    adminLocationId:
      adminLocationId || (access?.isAdmin ? canonicalLocationId : demo ? canonicalLocationId : undefined),
    demoLocationId,
    sourceId,
    type,
    demo,
    fromDemoCenter,
  };

  return (
    <MenuEditorClient
      initialData={initialData}
      locationId={canonicalLocationId}
      contextKey={contextKey}
      contextPayload={contextPayload}
    />
  );
}
