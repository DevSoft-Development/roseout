import MetricCard from "./MetricCard";
import {
  extractRequestId,
  getNested,
  type SearchExplorerEvent,
} from "@/lib/admin/search-explorer";
export default function SearchSummaryTab({
  event,
}: {
  event: SearchExplorerEvent;
}) {
  const fields: [string, unknown][] = [
    ["Search ID", event.id],
    ["Created", event.created_at],
    ["Source", event.source],
    ["Route", event.route],
    ["Duration", event.timing_ms == null ? null : `${event.timing_ms} ms`],
    ["Success", event.success],
    ["Had Issue", event.had_issue],
    ["Issue Type", event.issue_type],
    ["Issue Label", event.issue_label],
    [
      "Review Status",
      getNested(event, "metadata.review_status", "debug.review_status"),
    ],
    ["User ID", event.user_id],
    ["Anonymous ID", event.anonymous_id],
    ["Session ID", event.session_id],
    ["Request ID", extractRequestId(event)],
    [
      "Environment",
      getNested(
        event,
        "environment",
        "metadata.environment",
        "debug.environment",
      ),
    ],
    ["Results", event.result_count],
    ["Restaurants", event.restaurant_count],
    ["Activities", event.activity_count],
    ["Pairs", event.pair_count],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {fields.map(([label, value]) => (
        <MetricCard
          key={label}
          label={label}
          value={value}
          highlight={label === "Search ID" || label === "Duration"}
        />
      ))}
    </dl>
  );
}
