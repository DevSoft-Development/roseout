import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";
import ClaimQrPrintClient from "./ClaimQrPrintClient";
import RepairClaimQrButton from "./RepairClaimQrButton";
import { ensureClaimFields, syncClaimFieldsToLocations } from "@/lib/claimQrServer";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const metadata: Metadata = {
  title: "Claim QR Codes | TheOutHaven Admin",
  description: "Print and audit claim QR codes for TheOutHaven locations.",
};

type SearchParams = {
  q?: string;
  filter?: string;
  page?: string;
  pageSize?: string;
  repair?: string;
  locationId?: string;
  type?: string;
  mode?: string;
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

const PAGE_SIZE_OPTIONS = [400, 800, 1200, 2000] as const;
const FILTERS = [
  { label: "All", value: "all" },
  { label: "Missing QR", value: "missing_qr" },
  { label: "Missing Claim Code", value: "missing_claim_code" },
  { label: "Claimed", value: "claimed" },
  { label: "Unclaimed", value: "unclaimed" },
] as const;

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function buildClaimQrUrl({
  q,
  filter,
  page,
  pageSize,
}: {
  q: string;
  filter: string;
  page: number;
  pageSize: number | "all";
}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (filter !== "all") params.set("filter", filter);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return `/admin/dashboard/claim-qrs?${params.toString()}`;
}

function normalizeType(row: Record<string, unknown>): "restaurants" | "activities" {
  if (row.source_table === "activities" || row.location_type === "activity") {
    return "activities";
  }

  return "restaurants";
}

export default async function AdminClaimQrPrintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.claimQrs);

  const params = await searchParams;
  const q = params.q?.trim() || "";
  const filter = params.filter || "all";
  const selectedLocationId = params.locationId?.trim() || "";
  const page = Math.max(1, Number(params.page || 1));
  const loadAll = params.pageSize === "all";
  if (params.repair === "1") {
    await syncClaimFieldsToLocations({
      forceCanonicalUrl: true,
      regenerateQr: true,
    });
  }
  const requestedPageSize = Number(params.pageSize || 400);
  const pageSize = loadAll
    ? 100000
    : PAGE_SIZE_OPTIONS.includes(requestedPageSize as (typeof PAGE_SIZE_OPTIONS)[number])
      ? requestedPageSize
      : 400;
  const from = loadAll ? 0 : (page - 1) * pageSize;
  const to = loadAll ? 99999 : from + pageSize - 1;

  let query = supabase
    .from("locations")
    .select(
      "id, name, restaurant_name, activity_name, location_type, source_table, address, city, state, zip_code, claim_url, claim_code, qr_code_data_url, claim_qr_url, is_claimed, phone, google_place_id",
      { count: "exact" },
    )
    .order("name", { ascending: true });

  if (selectedLocationId) {
    query = query.eq("id", selectedLocationId).range(0, 0);
  } else {
    query = query.range(from, to);
  }

  if (!selectedLocationId && q) {
    query = query.or(
      `name.ilike.%${q}%,restaurant_name.ilike.%${q}%,activity_name.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%,zip_code.ilike.%${q}%,phone.ilike.%${q}%,google_place_id.ilike.%${q}%,claim_code.ilike.%${q}%`,
    );
  }

  if (!selectedLocationId && filter === "missing_qr") {
    query = query.or("qr_code_data_url.is.null,claim_qr_url.is.null");
  } else if (!selectedLocationId && filter === "missing_claim_code") {
    query = query.is("claim_code", null);
  } else if (!selectedLocationId && filter === "claimed") {
    query = query.eq("is_claimed", true);
  } else if (!selectedLocationId && filter === "unclaimed") {
    query = query.or("is_claimed.eq.false,is_claimed.is.null");
  }

  const { data, error, count } = await query;
  const total = count || 0;
  const totalPages = loadAll ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const safePage = loadAll ? 1 : Math.min(page, totalPages);

  for (const row of data || []) {
    const hasLegacyClaimUrl = /roseout\.com|roseout\.vercel\.app|theouthaven\.vercel\.app/i.test(
      String(row.claim_url || ""),
    );

    const missingQr = !row.claim_code || !(row.qr_code_data_url || row.claim_qr_url);

    if (missingQr || hasLegacyClaimUrl) {
      const fields = await ensureClaimFields(row, {
        table: "locations",
        forceCanonicalUrl: hasLegacyClaimUrl,
        regenerateQr: hasLegacyClaimUrl,
      });

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
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .qr-sheet { box-shadow: none !important; border: 0 !important; }
          .qr-card { break-inside: avoid; page-break-inside: avoid; border: 1px solid #111 !important; }
        }
      `}</style>
      <div className="mx-auto max-w-[1200px] print:max-w-none">
        <section className="no-print rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.24),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">
            Claim QR Codes
          </p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-tight">{selectedLocationId ? `QR Code for ${selectedLocationName}` : "Claim QR Codes"}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                {selectedLocationId ? "Print or download the reservation QR code for this selected location." : "Print labels, audit missing claim codes, and repair any old roseout QR codes so every scan opens TheOutHaven."}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">Total matching</p>
              <p className="mt-1 text-3xl font-black">{formatNumber(selectedLocationId ? locations.length : total)}</p>
            </div>
          </div>

          {!selectedLocationId && <form className="mt-5 grid gap-3 lg:grid-cols-[1fr_190px_160px_120px]">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search locations, addresses, cities, claim codes..."
              className="h-11 rounded-full border border-white/10 bg-white/[0.07] px-5 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-rose-300"
            />
            <select
              name="filter"
              defaultValue={filter}
              className="h-11 rounded-full border border-white/10 bg-white/[0.07] px-5 text-sm font-bold text-white outline-none focus:border-rose-300"
            >
              {FILTERS.map((item) => (
                <option key={item.value} className="text-black" value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              name="pageSize"
              defaultValue={loadAll ? "all" : pageSize}
              className="h-11 rounded-full border border-white/10 bg-white/[0.07] px-5 text-sm font-bold text-white outline-none focus:border-rose-300"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} className="text-black" value={option}>
                  {option} / page
                </option>
              ))}
              <option className="text-black" value="all">Load all</option>
            </select>
            <input type="hidden" name="page" value="1" />
            <button className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-3 text-sm font-black text-white shadow-lg" type="submit">
              Filter
            </button>
          </form>}

          {!selectedLocationId && <div className="mt-4"><RepairClaimQrButton /></div>}
          {!selectedLocationId && <div className="mt-3"><Link href="/admin/dashboard/claim-qrs?repair=1" className="rounded-full border border-rose-300/30 bg-rose-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-rose-100">Run full repair pass</Link></div>}

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={selectedLocationId ? `/reserve/dashboard?tab=today&adminLocationId=${encodeURIComponent(selectedLocationId)}&type=${encodeURIComponent(params.type || "location")}` : "/admin/dashboard"}
              className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
            >
              {selectedLocationId ? "Back to Reserve dashboard" : "Back to dashboard"}
            </Link>
            <Link
              href={selectedLocationId ? "/admin/dashboard/claim-qrs" : "/admin/dashboard/claim-tools"}
              className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
            >
              {selectedLocationId ? "View all QR codes" : "Claim Tools"}
            </Link>
          </div>
        </section>

        {error && (
          <div className="no-print mt-5 rounded-3xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm font-bold text-rose-100">
            {error.message}
          </div>
        )}

        {selectedLocationId && <div className="no-print mt-5 flex flex-wrap gap-3"><button onClick={() => window.print()} className="rounded-full bg-white px-5 py-3 text-sm font-black text-black">Print this QR</button><a href={locations[0]?.qr_code_data_url || "#"} download className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/80">Download QR</a></div>}

        <ClaimQrPrintClient locations={locations} />

        {!selectedLocationId && <div className="no-print mt-5 flex flex-wrap items-center justify-between gap-4">
          <Link
            href={buildClaimQrUrl({ q, filter, page: Math.max(1, safePage - 1), pageSize: loadAll ? "all" : pageSize })}
            className={`rounded-full px-5 py-3 text-sm font-black transition ${
              safePage <= 1
                ? "pointer-events-none border border-white/10 bg-white/[0.04] text-white/30"
                : "border border-white/10 bg-white text-black hover:scale-[1.02]"
            }`}
          >
            Previous
          </Link>
          <p className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/55">
            Showing {total ? from + 1 : 0}-{Math.min(from + locations.length, total)} of {formatNumber(total)} • {loadAll ? "All loaded" : `Page ${safePage} of ${totalPages}`}
          </p>
          <Link
            href={buildClaimQrUrl({ q, filter, page: Math.min(totalPages, safePage + 1), pageSize: loadAll ? "all" : pageSize })}
            className={`rounded-full px-5 py-3 text-sm font-black transition ${
              safePage >= totalPages
                ? "pointer-events-none border border-white/10 bg-white/[0.04] text-white/30"
                : "bg-gradient-to-r from-rose-500 to-rose-700 text-white hover:scale-[1.02]"
            }`}
          >
            Next
          </Link>
        </div>}
      </div>
    </main>
  );
}
