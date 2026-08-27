import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchTrace } from "../observability/searchTrace";
import type { RetrievalRequest } from "./retrievalTypes";

function normalizeTerm(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function needsLegacyMenuEvidenceHydration(request: RetrievalRequest) {
  const restaurantRole = request.desiredRole === "restaurant" || request.desiredRole.endsWith("_restaurant");
  if (!restaurantRole) return false;
  return request.foods.some((term) => normalizeTerm(term).includes(" "));
}

export async function hydrateLegacyRestaurantMenuEvidence({
  supabase,
  request,
  rows,
  trace,
}: {
  supabase: SupabaseClient;
  request: RetrievalRequest;
  rows: any[];
  trace?: SearchTrace;
}) {
  if (!rows.length || !needsLegacyMenuEvidenceHydration(request)) return rows;

  const missingIds = [
    ...new Set(
      rows
        .filter((row) => !Array.isArray(row?.signature_items))
        .map((row) => String(row?.id ?? "").trim())
        .filter(Boolean),
    ),
  ].slice(0, 100);

  if (!missingIds.length) return rows;

  const { data, error } = await supabase
    .from("locations")
    .select("id,signature_items")
    .in("id", missingIds);

  if (error) {
    trace?.decisions.push({
      stage: "retrieval",
      decision: "legacy_menu_evidence_hydration_failed",
      reason: error.message,
    });
    return rows;
  }

  const menuById = new Map(
    (Array.isArray(data) ? data : []).map((row: any) => [
      String(row.id),
      Array.isArray(row.signature_items) ? row.signature_items : [],
    ]),
  );

  let hydratedCount = 0;
  const hydratedRows = rows.map((row) => {
    const signatureItems = menuById.get(String(row?.id ?? ""));
    if (!signatureItems) return row;
    hydratedCount += 1;
    return { ...row, signature_items: signatureItems };
  });

  trace?.decisions.push({
    stage: "retrieval",
    decision: "legacy_menu_evidence_hydrated",
    reason: JSON.stringify({
      desiredRole: request.desiredRole,
      requestedCount: missingIds.length,
      hydratedCount,
    }),
  });

  return hydratedRows;
}
