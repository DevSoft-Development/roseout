import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import {
  getLocationOwnerAccess,
  resolveEditableLocationContext,
} from "@/lib/auth/locationOwnerAccess";
import { getEditableLocationMenu } from "@/lib/locations/menu";
import { getInternalDemoLocationAccess } from "@/lib/demo/internal-demo-location-access";
import MenuEditorClient from "@/app/business/dashboard/menu/MenuEditorClient";
import LocationMenuWorkspaceHeader from "./LocationMenuWorkspaceHeader";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LocationMenuPage({
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

  if (!locationId) redirect("/locations/dashboard");

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

  if (!access && !internalDemoAccess) redirect("/locations/dashboard");

  const canonicalLocationId = access?.canonicalLocationId || internalDemoAccess!.locationId;
  const menuAccess = access || {
    userId: user.id,
    canonicalLocationId,
    location: internalDemoAccess!.location,
    isAdmin: false,
    isDemoMode: true,
    permissions: { canRead: true, canEdit: true },
  };

  const initialData = await getEditableLocationMenu(
    canonicalLocationId,
    menuAccess as any,
  );

  const data = (initialData as any)?.data || initialData || {};
  const page = data.page || {};
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const items = Array.isArray(data.items) ? data.items : [];
  const location = data.location || menuAccess.location || {};
  const locationName =
    location.name ||
    location.location_name ||
    location.restaurant_name ||
    location.activity_name ||
    "Your location";
  const liveItems = items.filter((item: any) => item?.is_available !== false).length;
  const contextKey = adminLocationId
    ? "adminLocationId"
    : demoLocationId
      ? "demoLocationId"
      : "locationId";

  const contextPayload = {
    locationId: canonicalLocationId,
    adminLocationId:
      adminLocationId ||
      (access?.isAdmin
        ? canonicalLocationId
        : demo
          ? canonicalLocationId
          : undefined),
    demoLocationId,
    sourceId,
    type,
    demo,
    fromDemoCenter,
  };

  return (
    <main className="min-h-screen bg-[#07090d] px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1760px] space-y-5">
        <section className="rounded-[2rem] border border-white/10 bg-[#10131a] p-5 shadow-[0_24px_80px_rgba(0,0,0,.24)] sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">
                Menu & Packages
              </p>
              <h1 className="mt-2 text-3xl font-black sm:text-4xl">Build what guests can browse</h1>
              <p className="mt-3 text-sm font-semibold leading-6 text-white/60 sm:text-base">
                Add sections such as Food, Drinks, Hookah, Packages, or Experiences, then add the items and prices inside each section. Publish when you are ready for guests to see it.
              </p>
              <p className="mt-2 text-sm font-black text-white/80">{locationName}</p>
            </div>
            <LocationMenuWorkspaceHeader
              locationId={String(canonicalLocationId)}
              status={String(page.status || (page.is_active ? "published" : "draft"))}
              previewUrl={data.previewUrl}
              contextKey={contextKey}
              contextPayload={contextPayload}
            />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-white/40">Sections</p>
              <p className="mt-2 text-3xl font-black">{sections.length}</p>
              <p className="mt-1 text-xs font-semibold text-white/45">Food, drinks, packages, experiences, and more</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-white/40">Items</p>
              <p className="mt-2 text-3xl font-black">{items.length}</p>
              <p className="mt-1 text-xs font-semibold text-white/45">{liveItems} currently available to guests</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-white/40">Status</p>
              <p className="mt-2 text-2xl font-black capitalize">{String(page.status || "draft")}</p>
              <p className="mt-1 text-xs font-semibold text-white/45">Preview before publishing changes</p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ff2142] text-sm font-black">1</span>
              <div>
                <p className="font-black">Create a section</p>
                <p className="mt-1 text-sm font-semibold leading-5 text-white/50">Start with a simple category such as Appetizers, Cocktails, Birthday Packages, or Activities.</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ff2142] text-sm font-black">2</span>
              <div>
                <p className="font-black">Add the items</p>
                <p className="mt-1 text-sm font-semibold leading-5 text-white/50">Give each item a name, price, description, photo, and optional tags. You can hide sold-out items without deleting them.</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f5b700] text-sm font-black text-black">3</span>
              <div>
                <p className="font-black">Preview, then publish</p>
                <p className="mt-1 text-sm font-semibold leading-5 text-white/50">Check the guest view first. Publishing makes the menu visible; hiding it keeps your saved work without showing it publicly.</p>
              </div>
            </div>
          </div>
        </section>

        {!sections.length ? (
          <section className="rounded-2xl border border-[#f5b700]/20 bg-[#f5b700]/8 p-4 text-sm font-semibold text-amber-50">
            Start by adding your first section below. You do not need to build the entire menu at once — one section and a few items is enough to publish a useful first version.
          </section>
        ) : null}

        <MenuEditorClient
          initialData={initialData}
          locationId={String(canonicalLocationId)}
          contextKey={contextKey}
          contextPayload={contextPayload}
          returnHref="/locations/dashboard/menu"
          embedded
        />
      </div>
    </main>
  );
}
