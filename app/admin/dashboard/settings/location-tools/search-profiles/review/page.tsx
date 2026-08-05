import Link from "next/link";
import { redirect } from "next/navigation";

import { LocationToolShell, ToolCard } from "@/components/admin/location-tools/LocationToolShell";
import { SearchProfileReviewTable, type ReviewTableRow } from "@/components/admin/location-tools/SearchProfileReviewTable";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const REVIEW_QUEUE_PATH = "/admin/dashboard/settings/location-tools/search-profiles/review";

type Params = Record<string, string | string[] | undefined>;
type ReviewQueueRpcRow = {
  location_id: string | null;
  name: string | null;
  location_type: string | null;
  state: string | null;
  city: string | null;
  primary_domain: string | null;
  canonical_terms: string[] | null;
  confidence: number | string | null;
  profile_version: number | null;
  generated_at: string | null;
  severity: "blocking" | "warning" | "none";
  blocking_reasons: string[] | null;
  warning_reasons: string[] | null;
  filtered_count: number | null;
  total_needs_review_count: number | null;
  blocking_count: number | null;
  warning_count: number | null;
  reason_options: string[] | null;
};

const single = (value: string | string[] | undefined) => typeof value === "string" ? value.trim() : "";

function parsePage(value: string) {
  if (!/^\d+$/.test(value)) return 1;
  return Math.max(1, Number.parseInt(value, 10) || 1);
}

function filterQuery(params: { search: string; severity: string; reason: string }, page?: number) {
  const next = new URLSearchParams();
  if (params.search) next.set("search", params.search);
  if (params.severity && params.severity !== "all") next.set("severity", params.severity);
  if (params.reason) next.set("reason", params.reason);
  if (page && page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `${REVIEW_QUEUE_PATH}?${query}` : REVIEW_QUEUE_PATH;
}

function pageWindow(currentPage: number, totalPages: number) {
  const pages = new Set([1, totalPages]);
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let page = start; page <= end; page += 1) pages.add(page);
  return [...pages].sort((a, b) => a - b);
}

function PaginationFooter({ currentPage, totalRows, params }: { currentPage: number; totalRows: number; params: { search: string; severity: string; reason: string } }) {
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const from = totalRows === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, totalRows);
  const pages = pageWindow(currentPage, totalPages);
  const navClass = "rounded-lg border border-white/15 px-3 py-2 text-xs font-black text-white hover:bg-white/5";
  const disabledClass = "rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-white/25";

  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-sm text-white/65">
          <p>Showing <strong className="text-white">{from.toLocaleString()}–{to.toLocaleString()}</strong> of <strong className="text-white">{totalRows.toLocaleString()}</strong> profiles</p>
          <p className="mt-1 text-xs text-white/45">Page {currentPage.toLocaleString()} of {totalPages.toLocaleString()}</p>
        </div>
        <nav aria-label="Review queue pagination" className="flex flex-wrap items-center gap-2">
          {currentPage > 1 ? <Link className={navClass} href={filterQuery(params, 1)}>First</Link> : <span className={disabledClass}>First</span>}
          {currentPage > 1 ? <Link className={navClass} href={filterQuery(params, currentPage - 1)}>Previous</Link> : <span className={disabledClass}>Previous</span>}
          {pages.map((page, index) => (
            <span key={page} className="flex items-center gap-2">
              {index > 0 && page - pages[index - 1] > 1 ? <span className="text-white/35">…</span> : null}
              {page === currentPage ? <span aria-current="page" className="rounded-lg bg-white px-3 py-2 text-xs font-black text-black">{page}</span> : <Link className={navClass} href={filterQuery(params, page)}>{page}</Link>}
            </span>
          ))}
          {currentPage < totalPages ? <Link className={navClass} href={filterQuery(params, currentPage + 1)}>Next</Link> : <span className={disabledClass}>Next</span>}
          {currentPage < totalPages ? <Link className={navClass} href={filterQuery(params, totalPages)}>Last</Link> : <span className={disabledClass}>Last</span>}
        </nav>
      </div>
    </div>
  );
}

export default async function SearchProfileReviewQueue({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await requireAdminRole(["superadmin", "admin"]);
  const params = await searchParams;
  const severity = single(params.severity);
  const reason = single(params.reason);
  const search = single(params.search);
  const page = parsePage(single(params.page));
  const from = (page - 1) * PAGE_SIZE;

  const result = await supabaseAdmin.rpc("admin_search_profile_review_queue", {
    p_search: search || null,
    p_severity: severity || "all",
    p_reason: reason || null,
    p_page_size: PAGE_SIZE,
    p_offset: from,
  });
  if (result.error) throw new Error(`Review queue failed: ${result.error.message}`);

  const data = (result.data ?? []) as ReviewQueueRpcRow[];
  const first = data[0];
  const totalRows = Number(first?.filtered_count ?? 0);
  const totalNeedsReview = Number(first?.total_needs_review_count ?? totalRows);
  const blockingCount = Number(first?.blocking_count ?? 0);
  const warningCount = Number(first?.warning_count ?? 0);
  const reasonOptions = first?.reason_options ?? [];
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  if (page > totalPages) redirect(filterQuery({ search, severity, reason }, totalPages));

  const rows: ReviewTableRow[] = data.filter((row) => row.location_id).map((row) => ({
    locationId: row.location_id!,
    name: row.name ?? row.location_id!,
    locationType: row.location_type ?? "",
    state: row.state ?? "",
    city: row.city ?? "",
    status: "Needs Review",
    domain: row.primary_domain ?? "",
    canonicalTerms: row.canonical_terms ?? [],
    confidence: Number(row.confidence ?? 0),
    profileVersion: Number(row.profile_version ?? 0),
    generatedAt: row.generated_at ?? null,
    severity: row.severity,
    blockingReasons: row.blocking_reasons ?? [],
    warningReasons: row.warning_reasons ?? [],
  }));

  return (
    <LocationToolShell
      title="Search Profile Review Center"
      description="Review classification quality, correct safe issues, and approve search profiles without losing the context behind each decision."
      stats={[
        { label: "Showing", value: rows.length },
        { label: "Filtered", value: totalRows },
        { label: "Blocking", value: blockingCount },
        { label: "Warnings", value: warningCount },
        { label: "Needs Review", value: totalNeedsReview },
      ]}
    >
      <ToolCard title="Find profiles">
        <form action={REVIEW_QUEUE_PATH} className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1.4fr)_180px_minmax(240px,1fr)_auto] xl:items-end">
          <label className="min-w-0 text-xs font-bold uppercase tracking-wide text-white/50">
            Search
            <input name="search" defaultValue={search} placeholder="Location, type, state, city, domain, or term" className="mt-2 h-11 w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-rose-400/50" />
          </label>
          <label className="min-w-0 text-xs font-bold uppercase tracking-wide text-white/50">
            Severity
            <select name="severity" defaultValue={severity || "all"} className="mt-2 h-11 w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white">
              <option value="all">All severities</option><option value="blocking">Blocking conflicts</option><option value="warning">Warnings only</option>
            </select>
          </label>
          <label className="min-w-0 text-xs font-bold uppercase tracking-wide text-white/50">
            Review reason
            <select name="reason" defaultValue={reason} className="mt-2 h-11 w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white">
              <option value="">All review reasons</option>{reasonOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <button className="h-11 whitespace-nowrap rounded-xl bg-white px-5 text-sm font-black text-black hover:bg-white/90">Apply filters</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/45">
          <span><strong className="text-red-200">Blocking</strong> requires manual review.</span>
          <span><strong className="text-amber-100">Warning</strong> can be handled in bulk when evidence is consistent.</span>
        </div>
      </ToolCard>

      <ToolCard title={`Profiles requiring review (${totalRows.toLocaleString()} filtered)`}>
        <SearchProfileReviewTable rows={rows} isSuperadmin={admin.role === "superadmin"} />
        <PaginationFooter currentPage={page} totalRows={totalRows} params={{ search, severity, reason }} />
      </ToolCard>
    </LocationToolShell>
  );
}
