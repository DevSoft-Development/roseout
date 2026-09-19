import Link from "next/link";
import {
  Building2,
  ChevronDown,
  CircleCheckBig,
  Database,
  MapPin,
  SearchCheck,
  Store,
} from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminActionButton,
  AdminEmptyState,
  AdminFilterPanel,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminPagination,
  AdminSearchInput,
  AdminSectionCard,
  AdminStatusBadge,
  formatAdminDate,
} from "@/components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";
export const metadata = { title: "Locations | TheOutHaven Admin" };

type SearchParams = { q?: string; type?: string; status?: string; page?: string };

function nameFor(row: Record<string, unknown>) {
  return String(row.name || row.restaurant_name || row.activity_name || "Unnamed location");
}

function toneForStatus(status: unknown): "green" | "amber" | "red" | "muted" {
  const value = String(status || "").toLowerCase();
  if (["approved", "active", "published"].includes(value)) return "green";
  if (["pending", "review", "draft"].includes(value)) return "amber";
  if (["rejected", "disabled", "hidden"].includes(value)) return "red";
  return "muted";
}

function detailsHref(id: string) {
  return `/admin/dashboard/locations/id/${id}`;
}

function pageHref({
  q,
  type,
  status,
  page,
}: {
  q: string;
  type: string;
  status: string;
  page: number;
}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (type !== "all") params.set("type", type);
  if (status !== "all") params.set("status", status);
  params.set("page", String(page));
  return `?${params.toString()}`;
}

export default async function LocationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminRole(["superadmin", "admin", "editor", "reviewer", "viewer"]);
  const params = await searchParams;
  const q = String(params.q || "").trim().slice(0, 100);
  const type = String(params.type || "all");
  const status = String(params.status || "all");
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = 100;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = getAdminDatabaseClient()
    .from("locations")
    .select(
      "id,name,restaurant_name,activity_name,location_type,address,city,state,status,is_searchable,is_claimed,claim_status,rating,review_count,main_image,image_url,updated_at",
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (q) {
    const safe = q.replace(/[%_,()]/g, " ");
    query = query.or(
      `name.ilike.%${safe}%,restaurant_name.ilike.%${safe}%,activity_name.ilike.%${safe}%,address.ilike.%${safe}%,city.ilike.%${safe}%`,
    );
  }
  if (type !== "all") query = query.eq("location_type", type);
  if (status !== "all") query = query.eq("status", status);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data || []) as Array<Record<string, unknown>>;
  const total = count || 0;
  const searchableOnPage = rows.filter((row) => row.is_searchable === true).length;
  const claimedOnPage = rows.filter(
    (row) => row.is_claimed === true || row.claim_status === "approved",
  ).length;
  const approvedOnPage = rows.filter((row) => String(row.status || "") === "approved").length;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Location intelligence"
        title="Locations"
        subtitle="Search, review, and manage canonical TheOutHaven locations from one operational directory. Select any location to expand a concise overview without leaving the page."
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/locations/non-searchable">Non-searchable</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/locations/duplicates">Duplicates</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/locations/import">Import</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/locations/google-enrichment" variant="primary">
              Google enrichment
            </AdminActionButton>
          </>
        }
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Matching locations" value={total} helper="Across the current filter set" icon={Database} />
        <AdminKpiCard label="Showing now" value={rows.length} helper={`Page ${page} · up to ${pageSize} records`} icon={Building2} />
        <AdminKpiCard label="Searchable on page" value={searchableOnPage} helper="Eligible for consumer search" icon={SearchCheck} />
        <AdminKpiCard label="Claimed on page" value={claimedOnPage} helper={`${approvedOnPage} approved records on this page`} icon={CircleCheckBig} />
      </AdminKpiGrid>

      <AdminFilterPanel>
        <form className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_auto_auto] md:items-end">
          <label className="min-w-0">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Search</span>
            <AdminSearchInput
              name="q"
              defaultValue={q}
              placeholder="Name, address, or city"
              aria-label="Search locations"
            />
          </label>

          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Type</span>
            <select
              name="type"
              defaultValue={type}
              className="min-h-10 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold text-white outline-none focus:border-rose-300/50"
            >
              <option value="all">All types</option>
              <option value="restaurant">Restaurant</option>
              <option value="activity">Activity</option>
            </select>
          </label>

          <label>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Status</span>
            <select
              name="status"
              defaultValue={status}
              className="min-h-10 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold text-white outline-none focus:border-rose-300/50"
            >
              <option value="all">All statuses</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
            </select>
          </label>

          <button
            type="submit"
            className="min-h-10 rounded-xl bg-[#e1062a] px-4 py-2 text-sm font-black text-white transition hover:bg-rose-500"
          >
            Apply
          </button>
          <Link
            href="/admin/dashboard/locations"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] px-4 py-2 text-sm font-black text-white/75 hover:text-white"
          >
            Clear
          </Link>
        </form>
      </AdminFilterPanel>

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-white">Location directory</h2>
              <p className="mt-1 text-sm text-white/50">
                Click any row to expand a brief operational overview. Open the full record only when you need deeper editing or diagnostics.
              </p>
            </div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-white/40">
              {total.toLocaleString()} matches
            </span>
          </div>
        </div>

        {rows.length ? (
          <div className="divide-y divide-white/10">
            {rows.map((row) => {
              const id = String(row.id);
              const locationName = nameFor(row);
              const claimed = row.is_claimed === true || row.claim_status === "approved";
              const searchable = row.is_searchable === true;
              const address = [row.address, row.city, row.state].filter(Boolean).join(", ");
              const rating = Number(row.rating || 0);
              const reviewCount = Number(row.review_count || 0);
              const hasPhoto = Boolean(row.main_image || row.image_url);

              return (
                <details key={id} className="group">
                  <summary className="grid cursor-pointer list-none gap-4 px-4 py-4 transition hover:bg-white/[0.035] marker:hidden sm:px-5 lg:grid-cols-[minmax(0,2fr)_170px_170px_170px_32px] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-rose-100">
                          {String(row.location_type || "") === "activity" ? <MapPin className="h-4 w-4" /> : <Store className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-black text-white">{locationName}</p>
                          <p className="mt-1 truncate text-xs text-white/45">{address || "Address not available"}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Type</p>
                      <p className="mt-1 text-sm font-bold capitalize text-white/75">{String(row.location_type || "Unknown")}</p>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Status</p>
                      <div className="mt-1">
                        <AdminStatusBadge tone={toneForStatus(row.status)}>{String(row.status || "Unknown")}</AdminStatusBadge>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:block">
                      <p className="hidden text-[10px] font-black uppercase tracking-[0.14em] text-white/35 lg:block">Readiness</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <AdminStatusBadge tone={searchable ? "green" : "amber"}>{searchable ? "Searchable" : "Not searchable"}</AdminStatusBadge>
                        <AdminStatusBadge tone={claimed ? "green" : "muted"}>{claimed ? "Claimed" : "Unclaimed"}</AdminStatusBadge>
                      </div>
                    </div>

                    <ChevronDown className="hidden h-4 w-4 text-white/35 transition group-open:rotate-180 lg:block" />
                  </summary>

                  <div className="border-t border-white/10 bg-black/20 px-4 py-5 sm:px-5">
                    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_auto] lg:items-start">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-200">Brief overview</p>
                        <h3 className="mt-2 text-lg font-black text-white">{locationName}</h3>
                        <p className="mt-1 text-sm text-white/55">{address || "Address not available"}</p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {[
                            ["Rating", rating > 0 ? rating.toFixed(1) : "—"],
                            ["Reviews", reviewCount.toLocaleString()],
                            ["Photo", hasPhoto ? "On file" : "Missing"],
                            ["Updated", formatAdminDate(String(row.updated_at || ""))],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">{label}</p>
                              <p className="mt-1 text-sm font-black text-white/80">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Search state</p>
                          <p className="mt-2 text-sm font-black text-white">{searchable ? "Eligible for search" : "Requires attention"}</p>
                          <p className="mt-1 text-xs leading-5 text-white/45">
                            {searchable ? "This location can participate in consumer search results." : "Use Location Health tools to inspect why this record is not searchable."}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Claim state</p>
                          <p className="mt-2 text-sm font-black text-white">{claimed ? "Business claimed" : "Not claimed"}</p>
                          <p className="mt-1 text-xs leading-5 text-white/45">
                            Claim status: {String(row.claim_status || (claimed ? "approved" : "none"))}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:flex-col">
                        <Link
                          href={detailsHref(id)}
                          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#e1062a] px-4 py-2 text-sm font-black text-white hover:bg-rose-500"
                        >
                          Open full record
                        </Link>
                        {!searchable ? (
                          <Link
                            href="/admin/dashboard/locations/non-searchable"
                            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black text-white/75 hover:text-white"
                          >
                            Review search health
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <div className="p-5">
            <AdminEmptyState
              title="No locations match these filters"
              body="Clear one or more filters, or search by a broader name, address, or city."
              action={<AdminActionButton href="/admin/dashboard/locations">Clear filters</AdminActionButton>}
            />
          </div>
        )}
      </AdminSectionCard>

      <AdminPagination>
        <Link
          aria-disabled={page <= 1}
          href={pageHref({ q, type, status, page: Math.max(1, page - 1) })}
          className={`rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black text-white/70 ${page <= 1 ? "pointer-events-none opacity-40" : "hover:text-white"}`}
        >
          Previous
        </Link>
        <span className="px-2 text-sm font-bold text-white/45">Page {page}</span>
        <Link
          aria-disabled={to + 1 >= total}
          href={pageHref({ q, type, status, page: page + 1 })}
          className={`rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black text-white/70 ${to + 1 >= total ? "pointer-events-none opacity-40" : "hover:text-white"}`}
        >
          Next
        </Link>
      </AdminPagination>
    </AdminPageShell>
  );
}
