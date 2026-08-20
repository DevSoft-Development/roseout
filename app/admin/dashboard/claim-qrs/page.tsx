import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";
import ClaimQrPrintClient from "./ClaimQrPrintClient";
import { ensureClaimFields } from "@/lib/claimQrServer";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const metadata: Metadata = {
  title: "Claim QR Codes | TheOutHaven Admin",
  description: "Find, select, and print claim QR codes for TheOutHaven locations.",
};

type SearchParams = {
  q?: string;
  filter?: string;
  page?: string;
  pageSize?: string;
  locationId?: string;
  type?: string;
};

type ClaimQrLocation = {
  id: string;
  type: "restaurants" | "activities";
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  claim_url: string | null;
  claim_code: string | null;
  qr_code_data_url: string | null;
};

const PAGE_SIZE_OPTIONS = [100, 250, 500, 1000] as const;
const FILTERS = [
  { label: "All locations", value: "all" },
  { label: "Missing QR", value: "missing_qr" },
  { label: "Missing claim code", value: "missing_claim_code" },
  { label: "Unclaimed", value: "unclaimed" },
  { label: "Claimed", value: "claimed" },
] as const;

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function buildClaimQrUrl({ q, filter, page, pageSize }: { q: string; filter: string; page: number; pageSize: number | "all" }) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (filter !== "all") params.set("filter", filter);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return `/admin/dashboard/claim-qrs?${params.toString()}`;
}

function normalizeType(row: Record<string, unknown>): "restaurants" | "activities" {
  return row.source_table === "activities" || row.location_type === "activity" ? "activities" : "restaurants";
}

export default async function AdminClaimQrPrintPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.claimQrs);

  const params = await searchParams;
  const q = params.q?.trim() || "";
  const filter = params.filter || "all";
  const selectedLocationId = params.locationId?.trim() || "";
  const page = Math.max(1, Number(params.page || 1));
  const loadAll = params.pageSize === "all";
  const requestedPageSize = Number(params.pageSize || 100);
  const pageSize = loadAll ? 100000 : PAGE_SIZE_OPTIONS.includes(requestedPageSize as (typeof PAGE_SIZE_OPTIONS)[number]) ? requestedPageSize : 100;
  const from = loadAll ? 0 : (page - 1) * pageSize;
  const to = loadAll ? 99999 : from + pageSize - 1;

  const [allCountResult, missingQrResult, missingCodeResult, unclaimedResult] = await Promise.all([
    supabase.from("locations").select("id", { count: "exact", head: true }),
    supabase.from("locations").select("id", { count: "exact", head: true }).or("qr_code_data_url.is.null,claim_qr_url.is.null"),
    supabase.from("locations").select("id", { count: "exact", head: true }).is("claim_code", null),
    supabase.from("locations").select("id", { count: "exact", head: true }).or("is_claimed.eq.false,is_claimed.is.null"),
  ]);

  let query = supabase
    .from("locations")
    .select("id, name, restaurant_name, activity_name, location_type, source_table, address, city, state, zip_code, claim_url, claim_code, qr_code_data_url, claim_qr_url, is_claimed, phone, google_place_id", { count: "exact" })
    .order("name", { ascending: true });

  query = selectedLocationId ? query.eq("id", selectedLocationId).range(0, 0) : query.range(from, to);

  if (!selectedLocationId && q) {
    query = query.or(`name.ilike.%${q}%,restaurant_name.ilike.%${q}%,activity_name.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%,zip_code.ilike.%${q}%,phone.ilike.%${q}%,google_place_id.ilike.%${q}%,claim_code.ilike.%${q}%`);
  }

  if (!selectedLocationId && filter === "missing_qr") query = query.or("qr_code_data_url.is.null,claim_qr_url.is.null");
  else if (!selectedLocationId && filter === "missing_claim_code") query = query.is("claim_code", null);
  else if (!selectedLocationId && filter === "claimed") query = query.eq("is_claimed", true);
  else if (!selectedLocationId && filter === "unclaimed") query = query.or("is_claimed.eq.false,is_claimed.is.null");

  const { data, error, count } = await query;
  const total = count || 0;
  const totalPages = loadAll ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const safePage = loadAll ? 1 : Math.min(page, totalPages);

  for (const row of data || []) {
    const hasLegacyClaimUrl = /roseout\.com|roseout\.vercel\.app|theouthaven\.vercel\.app/i.test(String(row.claim_url || ""));
    const missingQr = !row.claim_code || !(row.qr_code_data_url || row.claim_qr_url);
    if (missingQr || hasLegacyClaimUrl) {
      const fields = await ensureClaimFields(row, { table: "locations", forceCanonicalUrl: hasLegacyClaimUrl, regenerateQr: hasLegacyClaimUrl });
      await supabaseAdmin.from("locations").update(fields).eq("id", row.id);
      Object.assign(row, fields);
    }
  }

  const locations: ClaimQrLocation[] = (data || []).map((row) => ({
    id: row.id,
    type: normalizeType(row),
    name: getLocationName(row, "Untitled location"),
    address: row.address,
    city: row.city,
    state: row.state,
    zip_code: row.zip_code,
    claim_url: row.claim_url,
    claim_code: row.claim_code,
    qr_code_data_url: row.qr_code_data_url || row.claim_qr_url,
  }));

  const selectedLocationName = selectedLocationId ? locations[0]?.name || "selected location" : "";

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-4 text-white print:bg-white print:px-0 print:py-0">
      <style>{`@media print {.no-print{display:none!important}.qr-sheet{box-shadow:none!important;border:0!important}.qr-card{break-inside:avoid;page-break-inside:avoid;border:1px solid #111!important}}`}</style>
      <div className="mx-auto max-w-[1200px] print:max-w-none">
        <section className="no-print rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.18),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-300">Claim QR Codes</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{selectedLocationId ? `QR code for ${selectedLocationName}` : "Find, select, and print"}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">{selectedLocationId ? "Use the controls below to print this location's claim QR code." : "Search for locations, narrow the list if needed, choose the QR codes you want, then print. Maintenance tools are kept separate from this everyday workflow."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={selectedLocationId ? "/admin/dashboard/claim-qrs" : "/admin/dashboard"} className="rounded-full border border-white/10 bg-white/[0.07] px-4 py-2.5 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white">{selectedLocationId ? "All QR codes" : "Dashboard"}</Link>
              {!selectedLocationId && <Link href="/admin/dashboard/claim-qrs/maintenance" className="rounded-full border border-white/10 bg-white/[0.07] px-4 py-2.5 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white">QR maintenance</Link>}
            </div>
          </div>

          {!selectedLocationId && (
            <>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[{ label: "All locations", value: allCountResult.count }, { label: "Missing QR", value: missingQrResult.count }, { label: "Missing claim code", value: missingCodeResult.count }, { label: "Unclaimed", value: unclaimedResult.count }].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45">{item.label}</p>
                    <p className="mt-2 text-2xl font-black">{formatNumber(item.value)}</p>
                  </div>
                ))}
              </div>

              <form className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4">
                <div className="grid gap-3 lg:grid-cols-[1fr_190px_auto]">
                  <input name="q" defaultValue={q} placeholder="Search location, address, city, ZIP, phone, or claim code" className="h-12 rounded-2xl border border-white/10 bg-white/[0.07] px-4 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-rose-300" />
                  <select name="filter" defaultValue={filter} className="h-12 rounded-2xl border border-white/10 bg-white/[0.07] px-4 text-sm font-bold text-white outline-none focus:border-rose-300">
                    {FILTERS.map((item) => <option key={item.value} className="text-black" value={item.value}>{item.label}</option>)}
                  </select>
                  <button className="h-12 rounded-2xl bg-white px-6 text-sm font-black text-black" type="submit">Show locations</button>
                </div>
                <input type="hidden" name="page" value="1" />
                <input type="hidden" name="pageSize" value={loadAll ? "all" : pageSize} />
                {(q || filter !== "all") && <Link href="/admin/dashboard/claim-qrs" className="mt-3 inline-flex text-xs font-black text-rose-200 hover:text-white">Clear search and filters</Link>}
              </form>
            </>
          )}
        </section>

        {error && <div className="no-print mt-5 rounded-3xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm font-bold text-rose-100">{error.message}</div>}

        <ClaimQrPrintClient locations={locations} />

        {!selectedLocationId && (
          <div className="no-print mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-bold text-white/55">Showing {total ? from + 1 : 0}-{Math.min(from + locations.length, total)} of {formatNumber(total)} {loadAll ? "· All loaded" : `· Page ${safePage} of ${totalPages}`}</p>
              <div className="flex flex-wrap items-center gap-2">
                <form className="flex items-center gap-2">
                  {q && <input type="hidden" name="q" value={q} />}
                  {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
                  <input type="hidden" name="page" value="1" />
                  <select name="pageSize" defaultValue={loadAll ? "all" : pageSize} className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-xs font-bold text-white">
                    {PAGE_SIZE_OPTIONS.map((option) => <option key={option} className="text-black" value={option}>{option} per page</option>)}
                    <option className="text-black" value="all">Load all</option>
                  </select>
                  <button className="h-10 rounded-xl border border-white/10 bg-white/[0.08] px-3 text-xs font-black">Apply</button>
                </form>
                <Link href={buildClaimQrUrl({ q, filter, page: Math.max(1, safePage - 1), pageSize: loadAll ? "all" : pageSize })} className={`rounded-xl px-4 py-2.5 text-xs font-black ${safePage <= 1 ? "pointer-events-none bg-white/[0.04] text-white/25" : "bg-white text-black"}`}>Previous</Link>
                <Link href={buildClaimQrUrl({ q, filter, page: Math.min(totalPages, safePage + 1), pageSize: loadAll ? "all" : pageSize })} className={`rounded-xl px-4 py-2.5 text-xs font-black ${safePage >= totalPages ? "pointer-events-none bg-white/[0.04] text-white/25" : "bg-rose-600 text-white"}`}>Next</Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
