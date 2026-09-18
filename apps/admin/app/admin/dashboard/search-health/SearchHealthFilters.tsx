import type {
  SearchHealthFilters,
} from "@/lib/admin/search-health-dashboard";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition focus:border-rose-500/50";

function Label({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-xs font-bold text-white/55">
      {title}
      {children}
    </label>
  );
}

export default function SearchHealthFiltersBar({
  filters,
}: {
  filters: SearchHealthFilters;
}) {
  return (
    <form
      action="/admin/dashboard/search-health"
      className="h-full rounded-2xl border border-white/10 bg-[#100d0c] p-5"
      data-testid="search-health-filters"
    >
      <div className="mb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-300">
          Search filters
        </p>
        <h2 className="mt-1 text-lg font-black">Production activity</h2>
      </div>

      <input type="hidden" name="tab" value="overview" />
      <input type="hidden" name="page" value="1" />
      <input type="hidden" name="issuePage" value="1" />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Label title="Date range">
          <select
            className={inputClass}
            defaultValue={filters.preset}
            name="range"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="custom">Custom</option>
          </select>
        </Label>

        <Label title="Custom start">
          <input className={inputClass} name="from" type="datetime-local" />
        </Label>

        <Label title="Custom end">
          <input className={inputClass} name="to" type="datetime-local" />
        </Label>

        <Label title="Search text">
          <input
            className={inputClass}
            defaultValue={filters.q}
            name="q"
            placeholder="Query contains..."
          />
        </Label>

        <Label title="Overall status">
          <select
            className={inputClass}
            defaultValue={filters.status}
            name="status"
          >
            <option value="all">All</option>
            <option value="healthy">Healthy</option>
            <option value="issue">Issue</option>
            <option value="failed">Failed</option>
          </select>
        </Label>

        <Label title="Source">
          <select
            className={inputClass}
            defaultValue={filters.source}
            name="source"
          >
            <option value="all">All sources</option>
            <option value="public_create_search">public_create_search</option>
          </select>
        </Label>

        <Label title="Severity">
          <select
            className={inputClass}
            defaultValue={filters.severity}
            name="severity"
          >
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </Label>

        <Label title="Review status">
          <select
            className={inputClass}
            defaultValue={filters.reviewStatus}
            name="review"
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="new">New</option>
            <option value="reviewing">Reviewing</option>
            <option value="fixed">Fixed</option>
            <option value="ignored">Ignored</option>
            <option value="archived">Archived</option>
          </select>
        </Label>

        <Label title="Speed status">
          <select
            className={inputClass}
            defaultValue={filters.speed}
            name="speed"
          >
            <option value="all">All</option>
            <option value="slow">Slow</option>
            <option value="critical">Critical</option>
            <option value="failed">Failed</option>
            <option value="timeout">Timeout</option>
            <option value="degraded">Degraded</option>
          </select>
        </Label>

        <Label title="Has issue">
          <select
            className={inputClass}
            defaultValue={filters.hasIssue}
            name="hasIssue"
          >
            <option value="all">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Label>

        <Label title="No results">
          <select
            className={inputClass}
            defaultValue={filters.noResults}
            name="noResults"
          >
            <option value="all">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Label>

        <Label title="No pairs">
          <select
            className={inputClass}
            defaultValue={filters.noPairs}
            name="noPairs"
          >
            <option value="all">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Label>

        <Label title="Rows per page">
          <select
            className={inputClass}
            defaultValue={filters.pageSize}
            name="pageSize"
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </Label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-rose-500">
          Apply filters
        </button>
        <a
          className="rounded-xl border border-white/10 px-5 py-2.5 text-sm font-black text-white/65 transition hover:text-white"
          href="/admin/dashboard/search-health?tab=overview&range=30d&source=all&status=all&severity=all&review=all&speed=all&hasIssue=all&noResults=all&noPairs=all&page=1&issuePage=1&pageSize=25"
        >
          Show all
        </a>
      </div>
    </form>
  );
}
