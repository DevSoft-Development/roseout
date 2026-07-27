"use client";
import Link from "next/link";
import {
  copyText,
  deriveHealthStatuses,
  downloadJson,
  extractRequestId,
  redactSensitive,
  type SearchExplorerEvent,
} from "@/lib/admin/search-explorer";
import StatusBadge from "./StatusBadge";
export default function SearchExplorerHeader({
  event,
}: {
  event: SearchExplorerEvent;
}) {
  const safe = redactSensitive(event);
  const metadata = redactSensitive(event.metadata);
  return (
    <header className="sticky top-0 z-20 -mx-1 rounded-2xl border border-white/10 bg-[#100d0c]/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-rose-300">
            Selected search event
          </p>
          <h2 className="mt-1 max-w-3xl truncate text-xl font-black">
            {event.raw_query || "Query not recorded"}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {deriveHealthStatuses(event).map((status) => (
              <StatusBadge key={status} status={status} />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/create?q=${encodeURIComponent(event.raw_query || "")}`}
            className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-black focus-visible:outline-2 focus-visible:outline-white"
          >
            Replay Search
          </Link>
          <button
            type="button"
            onClick={() => void copyText(JSON.stringify(metadata, null, 2))}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black"
          >
            Copy Metadata
          </button>
          <button
            type="button"
            onClick={() => void copyText(JSON.stringify(safe, null, 2))}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black"
          >
            Copy Full Event JSON
          </button>
          <button
            type="button"
            onClick={() => downloadJson(event, `search-event-${event.id}.json`)}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black"
          >
            Download JSON
          </button>
        </div>
      </div>
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/8 pt-3 text-xs">
        <Mini label="Created" value={event.created_at} />
        <Mini label="Source" value={event.source} />
        <Mini
          label="Duration"
          value={event.timing_ms == null ? null : `${event.timing_ms} ms`}
        />
        <Mini label="Results" value={event.result_count} />
        <Mini label="Pairs" value={event.pair_count} />
        <Mini label="Request ID" value={extractRequestId(event)} />
        <Mini label="Route" value={event.route} />
      </dl>
    </header>
  );
}
function Mini({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt className="text-white/30">{label}</dt>
      <dd className="mt-0.5 max-w-52 truncate font-bold text-white/75">
        {value === null || value === undefined || value === ""
          ? "—"
          : String(value)}
      </dd>
    </div>
  );
}
