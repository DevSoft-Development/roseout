import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { resolveEditableLocationContext } from "@/lib/auth/locationOwnerAccess";
import { getPublicLocationMenu } from "@/lib/locations/menu";
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

  const { location, page, sections, items } = await getPublicLocationMenu(
    requestedId,
    preview,
    commercePageId,
  );
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
    if (commercePageId) editorParams.set("page", commercePageId);
  }
  const editorBack = `/locations/dashboard/menu${editorParams.toString() ? `?${editorParams}` : ""}`;
  const locationName = location?.name || location?.location_name || "TheOutHaven location";
  const address = [location?.address, location?.city, location?.state].filter(Boolean).join(", ");

  return (
    <main className="min-h-screen bg-[#070809] text-white">
      <section className="relative overflow-hidden border-b border-white/10 bg-[#08090b]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(225,6,42,.24),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(245,183,0,.11),transparent_25%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={back}
              className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/55 transition hover:text-white"
            >
              <span aria-hidden="true">←</span> Back to location
            </Link>
            {preview ? (
              <span className="rounded-full border border-[#f5b700]/25 bg-[#f5b700]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#f8d778]">
                Guest preview
              </span>
            ) : null}
          </div>

          <div className="mt-9 max-w-4xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="h-px w-10 bg-[#f5b700]" />
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#f5b700]">TheOutHaven Menu</p>
            </div>
            <h1 className="font-serif text-5xl font-semibold leading-none tracking-[-0.035em] text-white sm:text-6xl lg:text-7xl">
              {page?.title || "Menu"}
            </h1>
            <div className="mt-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <p className="text-lg font-black text-white/90">{locationName}</p>
              {address ? (
                <>
                  <span className="hidden h-1 w-1 rounded-full bg-white/30 sm:block" />
                  <p className="text-sm font-semibold text-white/45">{address}</p>
                </>
              ) : null}
            </div>
            {page?.description ? (
              <p className="mt-6 max-w-2xl text-base font-medium leading-7 text-white/60">{page.description}</p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-9 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
        {!page ? (
          <div className="rounded-[2rem] border border-white/10 bg-[#0e1013] p-8 text-center shadow-[0_25px_80px_rgba(0,0,0,.3)] sm:p-12">
            <div className="mx-auto mb-5 h-px w-16 bg-[#f5b700]" />
            <h2 className="font-serif text-3xl font-semibold sm:text-4xl">
              {preview ? "This page has not been created yet." : "Menu is not available yet."}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-6 text-white/50">
              {preview ? "Go back to Menu & Packages to add items." : "Please check back soon."}
            </p>
            <Link
              href={preview ? editorBack : back}
              className="mt-7 inline-flex rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black text-white shadow-[0_12px_30px_rgba(225,6,42,.24)] transition hover:brightness-110"
            >
              {preview ? "Back to Menu & Packages" : "Back to profile"}
            </Link>
          </div>
        ) : (
          <div className="space-y-14">
            {sections.map((s: any, sectionIndex: number) => {
              const sectionItems = grouped[s.id] || [];
              return (
                <section key={s.id} className="scroll-mt-24">
                  <div className="mb-6 flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <div className="mb-2 flex items-center gap-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[#f5b700]">
                          {String(sectionIndex + 1).padStart(2, "0")}
                        </span>
                        <span className="h-px w-8 bg-[#f5b700]/60" />
                      </div>
                      <h2 className="font-serif text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
                        {s.title || s.name}
                      </h2>
                      {s.description ? (
                        <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-white/50">{s.description}</p>
                      ) : null}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/30">
                      {sectionItems.length} item{sectionItems.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {sectionItems.length ? (
                    <div className="grid gap-5 md:grid-cols-2">
                      {sectionItems.map((it: any) => (
                        <article
                          key={it.id}
                          className={`group overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#101216] shadow-[0_18px_50px_rgba(0,0,0,.24)] transition duration-300 hover:-translate-y-0.5 hover:border-white/15 hover:shadow-[0_24px_65px_rgba(0,0,0,.34)] ${
                            it.is_available === false ? "opacity-55" : ""
                          }`}
                        >
                          {it.image_url ? (
                            <div className="relative overflow-hidden bg-black">
                              <img
                                src={it.image_url}
                                alt={it.name || "Menu item"}
                                className="h-56 w-full object-cover transition duration-500 group-hover:scale-[1.025] sm:h-64"
                              />
                              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                              {it.is_featured ? (
                                <span className="absolute left-4 top-4 rounded-full border border-[#f5b700]/30 bg-black/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-[#f8d778] backdrop-blur">
                                  Featured
                                </span>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="p-5 sm:p-6">
                            <div className="flex items-start justify-between gap-5">
                              <div className="min-w-0">
                                <h3 className="font-serif text-2xl font-semibold leading-tight text-white">{it.name}</h3>
                                {it.description ? (
                                  <p className="mt-2 text-sm font-medium leading-6 text-white/50">{it.description}</p>
                                ) : null}
                              </div>
                              {price(it) ? (
                                <p className="shrink-0 rounded-full border border-[#f5b700]/20 bg-[#f5b700]/8 px-3 py-1.5 text-sm font-black text-[#f8d778]">
                                  {price(it)}
                                </p>
                              ) : null}
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2 border-t border-white/8 pt-4">
                              {it.is_featured && !it.image_url ? (
                                <span className="rounded-full border border-[#f5b700]/20 bg-[#f5b700]/8 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#f8d778]">
                                  Featured
                                </span>
                              ) : null}
                              {it.is_available === false ? (
                                <span className="rounded-full border border-white/10 bg-white/[.04] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white/45">
                                  Unavailable
                                </span>
                              ) : null}
                              {tags(it.tags).map((t: string) => (
                                <span
                                  key={t}
                                  className="rounded-full border border-white/10 bg-white/[.025] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white/45"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/[.02] p-8 text-center">
                      <p className="text-sm font-semibold text-white/35">No items have been added to this category yet.</p>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
