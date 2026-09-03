import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { hashMicrosoft365ClientState, markMicrosoft365SubscriptionLifecycle } from "@/lib/microsoft-365/subscriptions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type GraphNotification = {
  subscriptionId?: string;
  clientState?: string;
  changeType?: string;
  resource?: string;
  lifecycleEvent?: string;
};

function sameHash(expected: string, actual: string) {
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(actual, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  const validationToken = request.nextUrl.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const payload = await request.json().catch(() => ({}));
  const notifications = Array.isArray(payload?.value) ? payload.value as GraphNotification[] : [];
  if (!notifications.length) return NextResponse.json({ accepted: 0 }, { status: 202 });

  const subscriptionIds = [...new Set(notifications.map((item) => String(item.subscriptionId || "").trim()).filter(Boolean))];
  if (!subscriptionIds.length) return NextResponse.json({ accepted: 0 }, { status: 202 });

  const { data: subscriptions, error } = await supabaseAdmin
    .from("microsoft_365_subscriptions")
    .select("user_id,subscription_id,client_state_hash")
    .in("subscription_id", subscriptionIds);
  if (error) return NextResponse.json({ accepted: 0 }, { status: 202 });

  const bySubscription = new Map((subscriptions || []).map((row) => [row.subscription_id, row]));
  const byUser = new Map<string, { subscriptionIds: Set<string>; resources: Set<string>; changeTypes: Set<string>; lifecycleEvents: Set<string> }>();

  for (const notification of notifications) {
    const subscriptionId = String(notification.subscriptionId || "").trim();
    const clientState = String(notification.clientState || "");
    const row = bySubscription.get(subscriptionId);
    if (!row?.user_id || !row.client_state_hash || !clientState) continue;
    if (!sameHash(row.client_state_hash, hashMicrosoft365ClientState(clientState))) continue;

    const group = byUser.get(row.user_id) || {
      subscriptionIds: new Set<string>(),
      resources: new Set<string>(),
      changeTypes: new Set<string>(),
      lifecycleEvents: new Set<string>(),
    };
    group.subscriptionIds.add(subscriptionId);
    if (notification.resource) group.resources.add(String(notification.resource));
    if (notification.changeType) group.changeTypes.add(String(notification.changeType));
    if (notification.lifecycleEvent) group.lifecycleEvents.add(String(notification.lifecycleEvent));
    byUser.set(row.user_id, group);

    if (notification.lifecycleEvent) {
      try {
        await markMicrosoft365SubscriptionLifecycle(subscriptionId, notification.lifecycleEvent);
      } catch {
        // A later recovery sweep can repair subscription state.
      }
    } else {
      await supabaseAdmin.from("microsoft_365_subscriptions").update({
        last_notification_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("subscription_id", subscriptionId);
    }
  }

  if (byUser.size) {
    const receivedAt = new Date().toISOString();
    const rows = [...byUser.entries()].map(([userId, group]) => ({
      user_id: userId,
      subscription_ids: [...group.subscriptionIds],
      resources: [...group.resources],
      change_types: [...group.changeTypes],
      lifecycle_events: [...group.lifecycleEvents],
      notification_count: group.subscriptionIds.size,
      received_at: receivedAt,
    }));
    try {
      await supabaseAdmin.from("microsoft_365_webhook_events").insert(rows);
    } catch {
      // Graph retries webhook deliveries; returning quickly avoids an avoidable notification storm.
    }
  }

  return NextResponse.json({ accepted: byUser.size }, { status: 202 });
}
