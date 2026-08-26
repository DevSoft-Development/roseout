import "server-only";

import { requireServerEnv, requireSupabaseServiceRoleKey, requireSupabaseUrl } from "@/lib/env";

export type ConciergeEdgeResult = {
  success?: boolean;
  handled?: boolean;
  action?: string | null;
  reply?: string | null;
  locationId?: string | null;
  error?: string | null;
};

export async function routeConciergeInboundAtEdge(input: { from: string; body: string }): Promise<ConciergeEdgeResult> {
  const supabaseUrl = requireSupabaseUrl();
  const serviceRoleKey = requireSupabaseServiceRoleKey();
  const workerSecret = requireServerEnv("WORKER_INTERNAL_SECRET");

  const response = await fetch(`${supabaseUrl}/functions/v1/concierge-router`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "x-worker-secret": workerSecret,
    },
    body: JSON.stringify({ operation: "inbound", from: input.from, body: input.body }),
    cache: "no-store",
  });

  const text = await response.text();
  let result: ConciergeEdgeResult = {};
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { success: false, handled: false, error: text.slice(0, 500) || `Edge router returned ${response.status}` };
  }

  if (!response.ok) {
    console.error("CONCIERGE_EDGE_ROUTER_FAILED", { status: response.status, error: result.error || null });
    return { success: false, handled: false, error: result.error || `Edge router returned ${response.status}` };
  }

  return result;
}
