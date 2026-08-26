import "server-only";

import { requireServerEnv, requireSupabaseServiceRoleKey, requireSupabaseUrl } from "@/lib/env";

export type ConciergeEdgeResult = {
  success?: boolean;
  handled?: boolean;
  action?: string | null;
  reply?: string | null;
  locationId?: string | null;
  error?: string | null;
  locationCount?: number;
  expiresAt?: string | null;
};

async function invokeConciergeEdge(body: Record<string, unknown>): Promise<ConciergeEdgeResult> {
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
    body: JSON.stringify(body),
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
    console.error("CONCIERGE_EDGE_ROUTER_FAILED", { status: response.status, operation: body.operation || null, error: result.error || null });
    return { success: false, handled: false, error: result.error || `Edge router returned ${response.status}` };
  }

  return result;
}

export function routeConciergeInboundAtEdge(input: { from: string; body: string }) {
  return invokeConciergeEdge({ operation: "inbound", from: input.from, body: input.body });
}

export function seedConciergePlanContext(input: {
  phone: string;
  outingId?: string | null;
  restaurantLocationId?: string | null;
  activityLocationId?: string | null;
  plannedFor?: string | null;
}) {
  return invokeConciergeEdge({
    operation: "seed-plan",
    phone: input.phone,
    outingId: input.outingId || null,
    restaurantLocationId: input.restaurantLocationId || null,
    activityLocationId: input.activityLocationId || null,
    plannedFor: input.plannedFor || null,
  });
}
