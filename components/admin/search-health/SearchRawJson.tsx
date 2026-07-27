"use client";
import { useMemo, useState } from "react";
import {
  copyText,
  downloadJson,
  redactSensitive,
  type SearchExplorerEvent,
} from "@/lib/admin/search-explorer";
export default function SearchRawJson({
  event,
  search = "",
}: {
  event: SearchExplorerEvent;
  search?: string;
}) {
  const [wrap, setWrap] = useState(true),
    [localSearch, setLocalSearch] = useState("");
  const query = (localSearch || search).toLowerCase();
  const lines = useMemo(
    () => JSON.stringify(redactSensitive(event), null, 2).split("\n"),
    [event],
  );
  const visible = query
    ? lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => line.toLowerCase().includes(query))
    : lines.map((line, index) => ({ line, index }));
  const json = lines.join("\n");
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          aria-label="Search raw JSON"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search JSON lines"
          className="min-w-52 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-rose-400"
        />
        <button
          type="button"
          onClick={() => setWrap(!wrap)}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black"
        >
          Wrap: {wrap ? "On" : "Off"}
        </button>
        <button
          type="button"
          onClick={() => void copyText(json)}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black"
        >
          Copy JSON
        </button>
        <button
          type="button"
          onClick={() => downloadJson(event, `search-event-${event.id}.json`)}
          className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-black"
        >
          Download JSON
        </button>
      </div>
      {query && visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-white/45">
          No JSON lines match “{query}”.
        </p>
      ) : (
        <pre
          className={`max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-[#050404] p-4 text-xs leading-6 text-white/65 ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}
        >
          {visible.map(({ line, index }) => (
            <div key={index} className={query ? "bg-amber-400/10" : ""}>
              <span className="mr-5 inline-block w-10 select-none text-right text-white/20">
                {index + 1}
              </span>
              {line}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}
