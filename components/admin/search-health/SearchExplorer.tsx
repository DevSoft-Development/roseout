"use client";
import { useMemo, useState } from "react";
import {
  flattenJson,
  type ExplorerSection,
  type SearchExplorerEvent,
} from "@/lib/admin/search-explorer";
import SearchExplorerHeader from "./SearchExplorerHeader";
import SearchExplorerTabs from "./SearchExplorerTabs";
import SearchSummaryTab from "./SearchSummaryTab";
import SearchQueryTab from "./SearchQueryTab";
import SearchIntentTab from "./SearchIntentTab";
import SearchGeoTab from "./SearchGeoTab";
import SearchPipelineTab from "./SearchPipelineTab";
import SearchResultsTab from "./SearchResultsTab";
import SearchRankingTab from "./SearchRankingTab";
import SearchPerformanceTab from "./SearchPerformanceTab";
import SearchMetadataTree from "./SearchMetadataTree";
import SearchRawJson from "./SearchRawJson";
export default function SearchExplorer({
  event,
  section,
}: {
  event: SearchExplorerEvent;
  section: ExplorerSection;
}) {
  const [search, setSearch] = useState("");
  const matches = useMemo(
    () =>
      search
        ? flattenJson(event).filter((item) =>
            `${item.path} ${String(item.value)}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          ).length
        : 0,
    [event, search],
  );
  const content = {
    summary: <SearchSummaryTab event={event} />,
    query: <SearchQueryTab event={event} />,
    intent: <SearchIntentTab event={event} />,
    geo: <SearchGeoTab event={event} />,
    pipeline: <SearchPipelineTab event={event} />,
    results: <SearchResultsTab event={event} />,
    ranking: <SearchRankingTab event={event} />,
    performance: <SearchPerformanceTab event={event} />,
    metadata: <SearchMetadataTree event={event} search={search} />,
    raw: <SearchRawJson event={event} search={search} />,
  }[section];
  return (
    <section className="space-y-4" data-testid="search-explorer">
      <SearchExplorerHeader event={event} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-rose-300">
            Structured inspection
          </p>
          <h2 className="mt-1 text-xl font-black capitalize">
            {section === "raw" ? "Raw JSON" : section}
          </h2>
        </div>
        <label className="relative">
          <span className="sr-only">Search fields</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fields"
            className="w-64 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
          />
          {search ? (
            <span className="absolute right-3 top-3 text-[10px] text-white/35">
              {matches} matches
            </span>
          ) : null}
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
        <SearchExplorerTabs eventId={event.id} active={section} />
        <div className="min-w-0 rounded-2xl border border-white/10 bg-[#100d0c] p-4 sm:p-5">
          {search && !matches ? (
            <p
              role="status"
              className="mb-4 rounded-lg border border-amber-300/20 bg-amber-500/10 p-3 text-sm text-amber-100"
            >
              No event fields match “{search}”.
            </p>
          ) : null}
          {content}
        </div>
      </div>
    </section>
  );
}
