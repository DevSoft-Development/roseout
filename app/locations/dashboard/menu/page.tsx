import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import {
  getLocationOwnerAccess,
  resolveEditableLocationContext,
} from "@/lib/auth/locationOwnerAccess";
import {
  getEditableLocationMenu,
  getLocationCommercePages,
} from "@/lib/locations/menu";
import { getInternalDemoLocationAccess } from "@/lib/demo/internal-demo-location-access";
import MenuEditorClient from "@/app/business/dashboard/menu/MenuEditorClient";
import LocationMenuWorkspaceHeader from "./LocationMenuWorkspaceHeader";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageTypeLabel(value: unknown) {
  return String(value || "menu")
    .replace(/[_&]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

  const commercePages = await getLocationCommercePages(String(canonicalLocationId));
  const requestedPageId = first(params.page);
  const requestedPage = commercePages.find((entry) => String(entry.id) === requestedPageId);
  const defaultPage =
    commercePages.find((entry) => String(entry.page_type || "").toLowerCase() === "menu") ||
    commercePages[0] ||
    null;
  const selectedPageId = String(requestedPage?.id || defaultPage?.id || "") || undefined;

  const initialData = await getEditableLocationMenu(
    canonicalLocationId,
    menuAccess as any,
    selectedPageId,
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
    commercePageId: page.id || selectedPageId,
  };

  function pageHref(pageId: string) {
    const query = new URLSearchParams();
    query.set("page", pageId);
    if (adminLocationId) query.set("adminLocationId", adminLocationId);
    if (demoLocationId) query.set("demoLocationId", demoLocationId);
    if (sourceId) query.set("sourceId", sourceId);
    if (type) query.set("type", type);
    if (demo) query.set("demo", "1");
    if (fromDemoCenter) query.set("fromDemoCenter", "1");
    query.set("locationId", String(canonicalLocationId));
    return `/locations/dashboard/menu?${query.toString()}`;
  }

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
                Keep food, drinks, packages, private events, activities, and other offerings organized as separate pages. Choose a page below, then edit its sections and items.
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

          {commercePages.length ? (
            <div className="mt-6 border-t border-white/10 pt-5">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-white/40">Choose what you want to edit</p>
                  <p className="mt-1 text-sm font-semibold text-white/55">Each page keeps its own sections, items, prices, photos, and publish status.</p>
                </div>
                <p className="text-xs font-bold text-white/35">{commercePages.length} saved page{commercePages.length === 1 ? "" : "s"}</p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {commercePages.map((entry) => {
                  const active = String(entry.id) === String(page.id || selectedPageId || "");
                  const status = String(entry.status || (entry.is_active ? "published" : "draft"));
                  return (
                    <Link
                      key={String(entry.id)}
                      href={pageHref(String(entry.id))}
                      className={`min-w-[190px] rounded-2xl border p-3 transition ${active ? "border-[#ff2142]/60 bg-[#ff2142]/12" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-white">{entry.title || pageTypeLabel(entry.page_type)}</p>
                          <p className="mt-1 truncate text-xs font-semibold text-white/40">{pageTypeLabel(entry.page_type)}</p>
                        </div>
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${status === "published" ? "bg-emerald-400" : "bg-amber-300"}`} />
                      </div>
                      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-white/35">{status === "published" ? "Live" : "Draft"}</p>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-white/40">Sections</p>
              <p className="mt-2 text-3xl font-black">{sections.length}</p>
              <p className="mt-1 text-xs font-semibold text-white/45">On {page.title || "this page"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-white/40">Items</p>
              <p className="mt-2 text-3xl font-black">{items.length}</p>
              <p className="mt-1 text-xs font-semibold text-white/45">{liveItems} currently available</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-white/40">Page status</p>
              <p className="mt-2 text-2xl font-black capitalize">{String(page.status || "draft")}</p>
              <p className="mt-1 text-xs font-semibold text-white/45">Publish and hide each page independently</p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ff2142] text-sm font-black">1</span>
              <div>
                <p className="font-black">Create a section</p>
                <p className="mt-1 text-sm font-semibold leading-5 text-white/50">For example: Appetizers, Cocktails, Birthday Packages, Private Events, or Activities.</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ff2142] text-sm font-black">2</span>
              <div>
                <p className="font-black">Add items & photos</p>
                <p className="mt-1 text-sm font-semibold leading-5 text-white/50">Add the name, description, price, and tags, then upload a JPG, PNG, WebP, or GIF photo up to 8 MB. The upload fills the image URL automatically.</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f5b700] text-sm font-black text-black">3</span>
              <div>
                <p className="font-black">Preview, then publish</p>
                <p className="mt-1 text-sm font-semibold leading-5 text-white/50">Check the guest view first. Publishing makes the selected page live; hiding it keeps your saved work without showing it publicly.</p>
              </div>
            </div>
          </div>
        </section>

        {!sections.length ? (
          <section className="rounded-2xl border border-[#f5b700]/20 bg-[#f5b700]/8 p-4 text-sm font-semibold text-amber-50">
            Start by adding the first section for {page.title || "this page"}. You can build one useful section at a time instead of entering everything at once.
          </section>
        ) : null}

        <MenuEditorClient
          key={String(page.id || selectedPageId || "primary-menu")}
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
