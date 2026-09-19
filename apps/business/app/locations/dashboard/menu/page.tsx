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
import QuickAddMenuItem from "./QuickAddMenuItem";
import MenuPageBasics from "./MenuPageBasics";

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

function hasPrice(item: any) {
  return item?.price_cents != null || Boolean(String(item?.price_label || item?.price || "").trim());
}

function ReadyCheck({ label, done, detail }: { label: string; done: boolean; detail?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/8 bg-black/15 px-3 py-3">
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-black ${done ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.06] text-white/30"}`}>
        {done ? "✓" : "·"}
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-black ${done ? "text-white/75" : "text-white/45"}`}>{label}</p>
        {detail ? <p className="mt-0.5 text-xs font-semibold text-white/30">{detail}</p> : null}
      </div>
    </div>
  );
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
    locationId = ownerAccess.ownedLocationIds[0] || ownerAccess.ownedSourceLocationIds[0] || "";
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

  const initialData = await getEditableLocationMenu(canonicalLocationId, menuAccess as any, selectedPageId);
  const data = (initialData as any)?.data || initialData || {};
  const page = data.page || {};
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const items = Array.isArray(data.items) ? data.items : [];
  const location = data.location || menuAccess.location || {};
  const locationName = location.name || location.location_name || location.restaurant_name || location.activity_name || "Your location";
  const liveItems = items.filter((item: any) => item?.is_available !== false).length;
  const photoCount = items.filter((item: any) => Boolean(item?.image_url)).length;
  const pricedCount = items.filter(hasPrice).length;
  const describedCount = items.filter((item: any) => Boolean(String(item?.description || "").trim())).length;
  const pageStatus = String(page.status || (page.is_active ? "published" : "draft"));

  const readinessChecks = [
    Boolean(String(page.title || "").trim()),
    Boolean(String(page.description || "").trim()),
    items.length > 0,
    items.length > 0 && pricedCount === items.length,
    items.length > 0 && photoCount === items.length,
    sections.length > 0,
  ];
  const readiness = Math.round((readinessChecks.filter(Boolean).length / readinessChecks.length) * 100);

  const contextKey = adminLocationId ? "adminLocationId" : demoLocationId ? "demoLocationId" : "locationId";
  const contextPayload = {
    locationId: canonicalLocationId,
    adminLocationId: adminLocationId || (access?.isAdmin ? canonicalLocationId : demo ? canonicalLocationId : undefined),
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
    <main className="min-h-screen bg-[#050607] text-white">
      <div className="sticky top-0 z-30 border-b border-white/10 bg-[#050607]/95 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">Menu & Packages</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">Build your guest-facing menu step by step</h1>
            <p className="mt-1 max-w-2xl text-sm font-semibold text-white/45">Set up one page at a time, add what you sell, organize it, preview it, then publish when it feels ready.</p>
          </div>
          <LocationMenuWorkspaceHeader
            locationId={String(canonicalLocationId)}
            status={pageStatus}
            previewUrl={data.previewUrl}
            contextKey={contextKey}
            contextPayload={contextPayload}
          />
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_290px]">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e1062a]/15 text-sm font-black text-[#ff6b86]">1</span>
              <div>
                <h2 className="text-xl font-black">Choose what you are setting up</h2>
                <p className="mt-1 text-sm font-semibold text-white/45">Each menu, package list, event offering, or activity page has its own setup and publish status.</p>
              </div>
            </div>

            {commercePages.length ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {commercePages.map((entry) => {
                  const active = String(entry.id) === String(page.id || selectedPageId || "");
                  const status = String(entry.status || (entry.is_active ? "published" : "draft"));
                  return (
                    <Link
                      key={String(entry.id)}
                      href={pageHref(String(entry.id))}
                      className={`rounded-2xl border p-4 transition ${active ? "border-[#ff2142]/55 bg-[#ff2142]/10 shadow-lg shadow-[#ff2142]/5" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-white">{entry.title || pageTypeLabel(entry.page_type)}</p>
                          <p className="mt-1 text-xs font-semibold text-white/35">{pageTypeLabel(entry.page_type)}</p>
                        </div>
                        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${status === "published" ? "bg-emerald-400" : "bg-amber-300"}`} />
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">{status === "published" ? "Live" : "Draft"}</span>
                        {active ? <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#ff6b86]">Editing now</span> : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-5 text-sm font-semibold text-white/40">No menu or package pages have been created yet.</p>}
          </div>

          <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Menu readiness</p>
            <div className="mt-3 flex items-end gap-2"><p className="text-4xl font-black">{readiness}%</p><p className="pb-1 text-xs font-bold text-white/30">for this page</p></div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#ff2142]" style={{ width: `${readiness}%` }} /></div>
            <p className="mt-4 text-sm font-semibold leading-6 text-white/45">Use this as a setup guide, not a hard requirement. You can publish whenever the page accurately represents what guests can buy or book.</p>
            <div className="mt-5 space-y-2">
              <ReadyCheck label="Page name" done={readinessChecks[0]} />
              <ReadyCheck label="Guest introduction" done={readinessChecks[1]} detail="Recommended" />
              <ReadyCheck label="At least one item" done={readinessChecks[2]} />
              <ReadyCheck label="Prices added" done={readinessChecks[3]} detail={`${pricedCount} of ${items.length || 0}`} />
              <ReadyCheck label="Photos added" done={readinessChecks[4]} detail={`${photoCount} of ${items.length || 0}`} />
              <ReadyCheck label="Categories organized" done={readinessChecks[5]} />
            </div>
          </aside>
        </section>

        <MenuPageBasics locationId={String(canonicalLocationId)} page={page} contextKey={contextKey} contextPayload={contextPayload} />

        <section id="menu-items" className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-1">
          <div className="flex items-start gap-4 px-4 pb-1 pt-4 sm:px-5 sm:pt-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e1062a]/15 text-sm font-black text-[#ff6b86]">3</span>
            <div>
              <h2 className="text-xl font-black">Add your items</h2>
              <p className="mt-1 text-sm font-semibold text-white/45">Add the name, price, description, photo, and category. You can keep adding items without leaving this page.</p>
            </div>
          </div>
          <QuickAddMenuItem
            locationId={String(canonicalLocationId)}
            sections={sections}
            items={items}
            contextKey={contextKey}
            contextPayload={contextPayload}
          />
        </section>

        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e1062a]/15 text-sm font-black text-[#ff6b86]">4</span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-black">Organize and fine-tune</h2>
              <p className="mt-1 text-sm font-semibold text-white/45">Most owners can stop after adding items. Open this only when you want to reorder categories, edit tags, hide items, or adjust detailed settings.</p>
            </div>
          </div>
          <details className="group mt-5 rounded-2xl border border-white/10 bg-black/20">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
              <div><p className="font-black">Advanced organization</p><p className="mt-1 text-xs font-semibold text-white/35">{sections.length} categories · {items.length} items</p></div>
              <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-black text-white/60 group-open:hidden">Open</span>
              <span className="hidden rounded-full border border-white/10 px-3 py-1.5 text-xs font-black text-white/60 group-open:inline-flex">Close</span>
            </summary>
            <div className="border-t border-white/10 p-4">
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
          </details>
        </section>

        <section className="rounded-3xl border border-[#f5b700]/20 bg-gradient-to-br from-[#17130a] to-[#0d0b08] p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f5b700]/15 text-sm font-black text-[#f5b700]">5</span>
              <div>
                <h2 className="text-xl font-black">Review and publish</h2>
                <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-white/45">Preview the page exactly as a guest will see it. When everything looks accurate, publish it. You can continue editing after it is live.</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-white/45">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">{items.length} items</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">{photoCount} photos</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">{describedCount} descriptions</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">{liveItems} available</span>
                </div>
              </div>
            </div>
            <div className="shrink-0">
              <LocationMenuWorkspaceHeader
                locationId={String(canonicalLocationId)}
                status={pageStatus}
                previewUrl={data.previewUrl}
                contextKey={contextKey}
                contextPayload={contextPayload}
              />
            </div>
          </div>
        </section>

        <p className="pb-4 text-center text-xs font-semibold text-white/25">Editing {page.title || "this page"} for {locationName}</p>
      </div>
    </main>
  );
}
