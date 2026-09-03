import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { microsoftGraphFetch } from "./graph";

const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;
const SUBSCRIPTION_LIFETIME_MS = 2 * 24 * 60 * 60 * 1000;

const RESOURCE_SPECS = [
  { key: "inbox_messages", resource: "me/mailFolders('Inbox')/messages" },
  { key: "sent_messages", resource: "me/mailFolders('SentItems')/messages" },
  { key: "calendar_events", resource: "me/events" },
] as const;

type SubscriptionRow = {
  user_id: string;
  resource_key: string;
  resource: string;
  subscription_id: string | null;
  client_state_hash: string | null;
  expiration_at: string | null;
  status: string;
};

type GraphSubscription = {
  id: string;
  resource: string;
  expirationDateTime: string;
};

function notificationUrl() {
  const base = (process.env.M365_NOTIFICATION_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://theouthaven.com").replace(/\/$/, "");
  return `${base}/api/integrations/microsoft-365/webhook`;
}

function clientStateHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function expirationDateTime() {
  return new Date(Date.now() + SUBSCRIPTION_LIFETIME_MS).toISOString();
}

async function persistSubscription(userId: string, resourceKey: string, resource: string, subscription: GraphSubscription, hash: string | null) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("microsoft_365_subscriptions").upsert({
    user_id: userId,
    resource_key: resourceKey,
    resource,
    subscription_id: subscription.id,
    client_state_hash: hash,
    expiration_at: subscription.expirationDateTime,
    status: "active",
    last_error: null,
    updated_at: now,
  }, { onConflict: "user_id,resource_key" });
  if (error) throw error;
}

async function markSubscriptionError(userId: string, resourceKey: string, resource: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await supabaseAdmin.from("microsoft_365_subscriptions").upsert({
    user_id: userId,
    resource_key: resourceKey,
    resource,
    status: "error",
    last_error: message.slice(0, 1000),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,resource_key" });
}

async function createSubscription(userId: string, resourceKey: string, resource: string) {
  const clientState = randomBytes(32).toString("base64url");
  const subscription = await microsoftGraphFetch<GraphSubscription>(userId, "/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      changeType: "created,updated,deleted",
      notificationUrl: notificationUrl(),
      lifecycleNotificationUrl: notificationUrl(),
      resource,
      expirationDateTime: expirationDateTime(),
      clientState,
    }),
  });
  await persistSubscription(userId, resourceKey, resource, subscription, clientStateHash(clientState));
  return subscription;
}

async function renewSubscription(userId: string, row: SubscriptionRow) {
  if (!row.subscription_id) return createSubscription(userId, row.resource_key, row.resource);
  try {
    const subscription = await microsoftGraphFetch<GraphSubscription>(userId, `/subscriptions/${encodeURIComponent(row.subscription_id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expirationDateTime: expirationDateTime() }),
    });
    await persistSubscription(userId, row.resource_key, row.resource, subscription, row.client_state_hash);
    return subscription;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("M365_GRAPH_404") || message.includes("M365_GRAPH_410")) {
      return createSubscription(userId, row.resource_key, row.resource);
    }
    throw error;
  }
}

export async function ensureMicrosoft365Subscriptions(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("microsoft_365_subscriptions")
    .select("user_id,resource_key,resource,subscription_id,client_state_hash,expiration_at,status")
    .eq("user_id", userId);
  if (error) throw error;

  const existing = new Map((data || []).map((row) => [row.resource_key, row as SubscriptionRow]));
  const results: Array<{ resourceKey: string; ok: boolean; action: string; error?: string }> = [];

  for (const spec of RESOURCE_SPECS) {
    const row = existing.get(spec.key);
    const expiration = row?.expiration_at ? new Date(row.expiration_at).getTime() : 0;
    if (row?.status === "active" && row.subscription_id && expiration > Date.now() + RENEW_BEFORE_MS) {
      results.push({ resourceKey: spec.key, ok: true, action: "current" });
      continue;
    }

    try {
      if (row?.subscription_id && row.resource === spec.resource && row.status !== "removed") {
        await renewSubscription(userId, row);
        results.push({ resourceKey: spec.key, ok: true, action: "renewed" });
      } else {
        await createSubscription(userId, spec.key, spec.resource);
        results.push({ resourceKey: spec.key, ok: true, action: "created" });
      }
    } catch (caught) {
      await markSubscriptionError(userId, spec.key, spec.resource, caught).catch(() => undefined);
      results.push({ resourceKey: spec.key, ok: false, action: "error", error: caught instanceof Error ? caught.message.slice(0, 300) : "Subscription failed" });
    }
  }

  return results;
}

export async function markMicrosoft365SubscriptionLifecycle(subscriptionId: string, lifecycleEvent: string) {
  const status = lifecycleEvent === "subscriptionRemoved" ? "removed" : lifecycleEvent === "reauthorizationRequired" ? "renewal_required" : undefined;
  const update: Record<string, unknown> = {
    last_lifecycle_event: lifecycleEvent,
    last_notification_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (status) update.status = status;
  await supabaseAdmin.from("microsoft_365_subscriptions").update(update).eq("subscription_id", subscriptionId);
}

export function hashMicrosoft365ClientState(value: string) {
  return clientStateHash(value);
}
