import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { resolveEditableLocationContext } from "@/lib/auth/locationOwnerAccess";
import { getLocationCommercePages, getPublicLocationMenu } from "@/lib/locations/menu";
import { getPublicLocationHref } from "@/lib/locations/public-location-url";

export const dynamic = "force-dynamic";

function price(it: any) {
  return it.price_label || it.price || (it.price_cents != null ? `$${(it.price_cents / 100).toFixed(2)}` : "");
}

function tags(v: any) {
  return Array.isArray(v)
    ? v
    : typeof v === "string"
      ? (() => {
          try {
            return JSON.parse(v);
          } catch {
            return v.split(",");
          }
        })()
      : [];
}

function typePlural(t: string) {
  return t === "activities" || t === "activity" ? "activities" : "restaurants";
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function sectionAnchor(id: string, index: number) {
  return `menu-section-${id || index + 1}`;
}

function isMenuPage(page: any) {
  const pageType = String(page?.page_type || "").toLowerCase();
  return pageType === "menu" || pageType.includes("menu") || pageType.includes("drink");
}

function menuPageRank(page: any) {
  const pageType = String(page?.page_type || "").toLowerCase();
  const title = String(page?.title || "").toLowerCase();
  if (pageType === "food_menu") return 0;
  if (title.includes("food") && !title.includes("drink")) return 1;
  if (pageType === "menu" && !title.includes("drink")) return 2;
  if (title.includes("drink") || pageType.includes("drink")) return 3;
  return 4;
}

function menuPageLabel(page: any) {
  const pageType = String(page?.page_type || "").toLowerCase();
  if (pageType === "food_menu") return "Food Menu";
  return page?.title || "Menu";
}

function menuPageHref(
  type: string,
  locationId: string,
  sp: Record<string, string | string[] | undefined>,
  pageId: string,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") query.set(key, value);
  }
  query.set("page", pageId);
  query.delete("commercePageId");
  return `/locations/${encodeURIComponent(type)}/${encodeURIComponent(locationId)}/menu?${query.toString()}`;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; locationId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { type, locationId } = await params;
  const sp = (await searchParams) || {};
  const commercePageId = first(sp.page) || first(sp.commercePageId) || undefined;
  const wantsPreview =
    sp.demo === "1" ||
    sp.fromDemoCenter === "1" ||
    sp.adminLocationMode === "1" ||
    Boolean(sp.adminLocationId);
  let preview = false;
  const requestedId = String(first(sp.adminLocationId) || first(sp.locationId) || locationId);

  if (wantsPreview) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      preview = Boolean(
        await resolveEditableLocationContext({
          userId: user.id,
          locationId: requestedId,
          adminLocationId: String(first(sp.adminLocationId) || ""),
          type,
          demo: sp.demo === "1",
          fromDemoCenter: sp.fromDemoCenter === "1",
        }),
      );
    }
  }

  let menuData = await getPublicLocationMenu(requestedId, preview, commercePageId);
  let menuPages: any[] = [];

  if (menuData.location?.id) {
    const allPages = await getLocationCommercePages(String(menuData.location.id));
    menuPages = allPages
      .filter(isMenuPage)
      .filter((candidate) => preview || (candidate.status === "published" && candidate.is_active === true))
      .sort((a, b) => menuPageRank(a) - menuPageRank(b) || Number(a.sort_order || 0) - Number(b.sort_order || 0));

    if (!commercePageId && menuPages.length) {
      const preferredPageId = String(menuPages[0].id);
      if (preferredPageId !== String(menuData.page?.id || "")) {
        menuData = await getPublicLocationMenu(requestedId, preview, preferredPageId);
      }
    }
  }

  const { location, page, sections, items } = menuData;
  const grouped = items.reduce((a: any, x: any) => {
    (a[x.section_id || ""] ||= []).push(x);
    return a;
  }, {});
  const back = getPublicLocationHref(location || { id: locationId, type });
  const editorParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") editorParams.set(k, v);
  if (preview) {
    editorParams.set("adminLocationId", String(location?.id || requestedId));
    editorParams.set("locationId", String(location?.id || requestedId));
    editorParams.set("type", typePlural(type) === "activities" ? "activity" : "restaurant");
    if (page?.id) editorParams.set("page", String(page.id));
  }
  const editorBack = `/locations/dashboard/menu${editorParams.toString() ? `?${editorParams}` : ""}`;
  const locationName = location?.name || location?.location_name || "TheOutHaven location";
  const address = [location?.address, location?.city, location?.state].filter(Boolean).join(", ");

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-[#161719]">
      <header className="border-b border-black/8 bg-[#0b0c0e] text-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link
              href={back}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-sm font-bold text-white/70 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-[#f5b700]"
            >
              <span aria-hidden="true">←</span>
              <span>Back to location</span>
            </Link>
            <div className="flex items-center gap-2">
              {preview ? (
                <span className="rounded-full border border-[#f5b700]/35 bg-[#f5b700]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-[#f8d778]">
                  Guest preview
                </span>
              ) : null}
              <span className="hidden text-[11px] font-black uppercase tracking-[0.2em] text-white/35 sm:inline">
                Powered by TheOutHaven
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="border-b border-black/8 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#c30e2e]">
                <span className="h-2 w-2 rounded-full bg-[#e1062a]" />
                Menu
              </div>
              <h1 className="text-4xl font-black tracking-[-0.035em] text-[#111214] sm:text-5xl">
                {page?.title || "Menu"}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-extrabold text-[#1d1e20]">{locationName}</span>
                {address ? (
                  <>
                    <span className="text-black/20">•</span>
                    <span className="font-medium text-black/50">{address}</span>
                  </>
                ) : null}
              </div>
              {page?.description ? (
                <p className="mt-4 max-w-2xl text-[15px] font-medium leading-7 text-black/55">{page.description}</p>
              ) : null}

              {menuPages.length > 1 ? (
                <div className="mt-6 flex flex-wrap gap-2" aria-label="Available menus">
                  {menuPages.map((menuPage) => {
                    const selected = String(menuPage.id) === String(page?.id || "");
                    return (
                      <Link
                        key={menuPage.id}
                        href={menuPageHref(type, locationId, sp, String(menuPage.id))}
                        aria-current={selected ? "page" : undefined}
                        className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#e1062a]/30 ${
                          selected
                            ? "border-[#e1062a] bg-[#e1062a] text-white shadow-[0_6px_16px_rgba(225,6,42,.16)]"
                            : "border-black/10 bg-white text-black/60 hover:border-black/20 hover:text-black"
                        }`}
                      >
                        {menuPageLabel(menuPage)}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {page ? (
              <div className="rounded-2xl border border-black/8 bg-[#fafaf8] px-4 py-3 text-sm shadow-sm">
                <div className="font-extrabold text-[#1a1b1d]">{items.length} menu item{items.length === 1 ? "" : "s"}</div>
                <div className="mt-0.5 text-xs font-semibold text-black/45">Across {sections.length} categor{sections.length === 1 ? "y" : "ies"}</div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {page && sections.length ? (
        <nav className="sticky top-0 z-30 border-b border-black/8 bg-white/95 shadow-[0_6px_18px_rgba(0,0,0,0.04)] backdrop-blur" aria-label="Menu categories">
          <div className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-max gap-1 py-3">
              {sections.map((s: any, index: number) => (
                <a
                  key={s.id}
                  href={`#${sectionAnchor(s.id, index)}`}
                  className="inline-flex min-h-10 items-center rounded-full border border-transparent px-4 text-sm font-extrabold text-black/58 transition hover:border-black/8 hover:bg-black/[.035] hover:text-black focus:outline-none focus:ring-2 focus:ring-[#e1062a]/30"
                >
                  {s.title || s.name}
                </a>
              ))}
            </div>
          </div>
        </nav>
      ) : null}

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        {!page ? (
          <div className="mx-auto max-w-2xl rounded-3xl border border-black/8 bg-white p-8 text-center shadow-[0_16px_50px_rgba(0,0,0,.06)] sm:p-12">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#e1062a]/8 text-xl font-black text-[#e1062a]">M</div>
            <h2 className="text-2xl font-black tracking-tight text-[#151618] sm:text-3xl">
              {preview ? "This page has not been created yet." : "Menu is not available yet."}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-6 text-black/50">
              {preview ? "Go back to Menu & Packages to add items." : "Please check back soon."}
            </p>
            <Link
              href={preview ? editorBack : back}
              className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black text-white shadow-[0_10px_24px_rgba(225,6,42,.18)] transition hover:bg-[#c80a28] focus:outline-none focus:ring-2 focus:ring-[#e1062a]/35"
            >
              {preview ? "Back to Menu & Packages" : "Back to profile"}
            </Link>
          </div>
        ) : sections.length ? (
          <div className="mx-auto max-w-5xl space-y-12 sm:space-y-14">
            {sections.map((s: any, sectionIndex: number) => {
              const sectionItems = grouped[s.id] || [];
              const anchor = sectionAnchor(s.id, sectionIndex);

              return (
                <section key={s.id} id={anchor} className="scroll-mt-24">
                  <div className="mb-5 border-b border-black/10 pb-4 sm:mb-6">
                    <div className="flex items-end justify-between gap-5">
                      <div>
                        <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#c30e2e]">
                          {String(sectionIndex + 1).padStart(2, "0")}
                        </p>
                        <h2 className="text-2xl font-black tracking-[-0.025em] text-[#17181a] sm:text-3xl">
                          {s.title || s.name}
                        </h2>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-black/35">
                        {sectionItems.length} item{sectionItems.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {s.description ? (
                      <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-black/48">{s.description}</p>
                    ) : null}
                  </div>

                  {sectionItems.length ? (
                    <div className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-[0_10px_35px_rgba(0,0,0,.045)]">
                      {sectionItems.map((it: any, itemIndex: number) => {
                        const itemTags = tags(it.tags);
                        return (
                          <article
                            key={it.id}
                            className={`group flex gap-3 p-4 sm:gap-4 sm:p-5 ${itemIndex ? "border-t border-black/[.07]" : ""} ${
                              it.is_available === false ? "bg-black/[.02] opacity-60" : ""
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-[16px] font-extrabold leading-6 text-[#17181a] sm:text-[17px]">{it.name}</h3>
                                    {it.is_featured ? (
                                      <span className="rounded-full bg-[#f5b700]/14 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#8a6200]">
                                        Featured
                                      </span>
                                    ) : null}
                                  </div>
                                  {it.description ? (
                                    <p className="mt-1.5 max-w-2xl text-sm font-medium leading-6 text-black/50">{it.description}</p>
                                  ) : null}
                                </div>
                                {price(it) ? (
                                  <p className="shrink-0 text-[15px] font-black tabular-nums text-[#17181a]">{price(it)}</p>
                                ) : null}
                              </div>

                              {(itemTags.length || it.is_available === false) ? (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {it.is_available === false ? (
                                    <span className="rounded-full border border-black/8 bg-black/[.035] px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-black/45">
                                      Unavailable
                                    </span>
                                  ) : null}
                                  {itemTags.map((t: string) => (
                                    <span
                                      key={t}
                                      className="rounded-full border border-black/8 bg-[#fafaf8] px-2 py-1 text-[10px] font-bold text-black/45"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            {it.image_url ? (
                              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-black/5 sm:h-20 sm:w-20">
                                <Image
                                  src={it.image_url}
                                  alt={it.name || "Menu item"}
                                  fill
                                  sizes="(max-width: 640px) 64px, 80px"
                                  className="object-cover transition duration-300 group-hover:scale-[1.03]"
                                />
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-black/10 bg-white/65 p-8 text-center">
                      <p className="text-sm font-semibold text-black/35">No items have been added to this category yet.</p>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="mx-auto max-w-2xl rounded-3xl border border-black/8 bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-black text-[#17181a]">This menu is being prepared.</h2>
            <p className="mt-2 text-sm font-medium text-black/45">Please check back soon.</p>
          </div>
        )}
      </div>

      <footer className="border-t border-black/8 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-7 text-xs font-semibold text-black/40 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>{locationName}</span>
          <span>Menu powered by TheOutHaven</span>
        </div>
      </footer>
    </main>
  );
}
