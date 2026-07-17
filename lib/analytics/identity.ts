export type SearchContext = Record<string, unknown> & { normalized_query?: string | null };

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

// FNV-1a is deterministic in browsers and Node. It is a privacy fingerprint, not a security primitive.
function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) { result ^= value.charCodeAt(i); result = Math.imul(result, 0x01000193); }
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function normalizeQuery(query: unknown): string { return typeof query === "string" ? query.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 500) : ""; }
export function createQueryFingerprint(context: SearchContext): string {
  const allowed = { query: normalizeQuery(context.normalized_query), intent: context.intent ?? context.search_intent ?? null, market: context.market ?? null, city: context.city ?? null, borough: context.borough ?? null, neighborhood: context.neighborhood ?? null, date: context.requested_date ?? null, time: context.requested_time ?? null, walkable: context.walkable ?? context.walking_requirement ?? null };
  return `qf1_${hash(stable(allowed))}`;
}
export function createPairId(restaurantLocationId: unknown, activityLocationId: unknown, searchContext: unknown = null): string {
  const ids = [String(restaurantLocationId ?? "").trim().toLowerCase(), String(activityLocationId ?? "").trim().toLowerCase()];
  return `pair1_${hash(stable({ restaurant: ids[0], activity: ids[1], context: searchContext }))}`;
}
export function createDedupeKey(input: { event_name: string; search_id?: unknown; location_id?: unknown; pair_id?: unknown; session_id?: unknown; action_id?: unknown; occurred_at?: unknown }): string {
  const bucket = input.action_id ?? (typeof input.occurred_at === "string" ? input.occurred_at.slice(0, 16) : "");
  return `evt1_${hash(stable([input.event_name, input.search_id, input.location_id, input.pair_id, input.session_id, bucket]))}`;
}
