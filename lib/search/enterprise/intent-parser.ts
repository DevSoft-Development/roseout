import { finalizeSearchIntent } from "./finalizeSearchIntent";
import { parseEnterpriseIntent as parseEnterpriseIntentCore } from "./intent-parser-core";

export * from "./intent-parser-core";

type ParseEnterpriseIntentOptions = Parameters<typeof parseEnterpriseIntentCore>[1];
type ExplicitSearchLane = "auto" | "restaurant" | "activity" | "mixed";

function normalizeSearchLaneValue(value: unknown): ExplicitSearchLane | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().trim().replace(/_/g, "-");
  if (["restaurant", "restaurants", "food", "dining", "restaurant-only", "restaurant only"].includes(normalized)) return "restaurant";
  if (["activity", "activities", "things-to-do", "things to do", "activity-only", "activity only"].includes(normalized)) return "activity";
  if (["mixed", "mixed-outing", "mixed outing", "outing", "pairing"].includes(normalized)) return "mixed";
  if (["auto", "any", "all", "default"].includes(normalized)) return "auto";
  return null;
}

function selectedSearchLaneFromBody(body: unknown): ExplicitSearchLane {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return (
    normalizeSearchLaneValue(record.selectedSearchLane) ??
    normalizeSearchLaneValue(record.selected_search_lane) ??
    normalizeSearchLaneValue(record.searchLane) ??
    normalizeSearchLaneValue(record.search_lane) ??
    normalizeSearchLaneValue(record.lane) ??
    normalizeSearchLaneValue(record.searchType) ??
    normalizeSearchLaneValue(record.search_type) ??
    "auto"
  );
}

/**
 * Public/request-aware parser boundary.
 *
 * The parser core remains independently testable because several low-level
 * contracts intentionally assert its provisional same-venue semantics. The
 * live enterprise/public path always supplies the request body and is then
 * reconciled by finalizeSearchIntent so explicit activity evidence cannot be
 * lost before retrieval and pairing.
 */
export async function parseEnterpriseIntent(
  query: string,
  options?: ParseEnterpriseIntentOptions,
) {
  const result = await parseEnterpriseIntentCore(query, options);

  if (options?.body == null) {
    return result;
  }

  const finalizedIntent = finalizeSearchIntent({
    query,
    intent: result.intent,
    selectedLane: selectedSearchLaneFromBody(options.body),
  });

  return {
    ...result,
    intent: finalizedIntent,
    debug: {
      ...result.debug,
      finalIntentReconciled: finalizedIntent !== result.intent,
    },
  };
}
