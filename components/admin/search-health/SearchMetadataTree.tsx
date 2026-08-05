"use client";

import { useMemo, useState } from "react";
import {
  redactSensitive,
  type SearchExplorerEvent,
} from "@/lib/admin/search-explorer";
import TreeNode from "./TreeNode";

export default function SearchMetadataTree({
  event,
  search = "",
}: {
  event: SearchExplorerEvent;
  search?: string;
}) {
  const [expand, setExpand] = useState(0);
  const [collapse, setCollapse] = useState(0);
  const metadata = useMemo(
    () => redactSensitive(event.metadata),
    [event.metadata],
  );
  const debug = useMemo(() => redactSensitive(event.debug), [event.debug]);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setExpand(Date.now())}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black hover:border-rose-400/40"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={() => setCollapse(Date.now())}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black hover:border-rose-400/40"
        >
          Collapse all
        </button>
      </div>
      <div className="space-y-4">
        {event.metadata === null ? (
          <Empty name="Metadata" />
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <TreeNode
              name="metadata"
              value={metadata}
              path="metadata"
              expandSignal={expand}
              collapseSignal={collapse}
              search={search}
            />
          </div>
        )}
        {event.debug === null ? (
          <Empty name="Debug" />
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <TreeNode
              name="debug"
              value={debug}
              path="debug"
              expandSignal={expand}
              collapseSignal={collapse}
              search={search}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ name }: { name: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-white/45">
      {name} was not recorded for this search.
    </div>
  );
}
