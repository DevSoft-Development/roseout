import CopyField from "./CopyField";
import {
  getNested,
  type SearchExplorerEvent,
} from "@/lib/admin/search-explorer";
export default function SearchQueryTab({
  event,
}: {
  event: SearchExplorerEvent;
}) {
  const fields: [string, unknown][] = [
    ["Raw Query", event.raw_query],
    ["Normalized Query", event.normalized_query],
    ["Search Type", event.search_type],
    ["Primary Domain", event.primary_domain],
    [
      "Intent Parser Source",
      event.intent_parser_source ??
        getNested(event, "debug.intentParserSource"),
    ],
    ["Route", event.route],
    ["Source", event.source],
    [
      "Environment",
      getNested(
        event,
        "environment",
        "metadata.environment",
        "debug.environment",
      ),
    ],
    [
      "Search Version",
      getNested(
        event,
        "metadata.searchVersion",
        "metadata.search_version",
        "debug.searchVersion",
      ),
    ],
    [
      "Request Origin",
      getNested(
        event,
        "metadata.requestOrigin",
        "metadata.request_origin",
        "debug.requestOrigin",
      ),
    ],
    [
      "Selected Search Lane",
      getNested(
        event,
        "metadata.selectedSearchLane",
        "metadata.search_lane",
        "debug.selectedSearchLane",
      ),
    ],
  ];
  return (
    <dl className="rounded-2xl border border-white/10 bg-black/20 px-4">
      {fields.map(([label, value]) => (
        <CopyField key={label} label={label} value={value} />
      ))}
    </dl>
  );
}
