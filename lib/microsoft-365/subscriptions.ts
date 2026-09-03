import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { microsoftGraphFetch } from "./graph";

const SUBSCRIPTION_LIFETIME_MS = 48 * 60 * 60 * 1000;
const RENEW_BEFORE_MS = 12 * 60 * 60 * 1000;

type GraphSubscription = {
  id: string;
  resource: string;
  notificationUrl?: string | null;
  expirationDateTime?: string | null;
};

type GraphCollection<T> = { value?: T[]; "@odata.nextLink"?: string };

function webhookKey() {
  const raw = process.env.M365_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("M365_TOKEN_ENCRYPTION_KEY_MISSING");
  return Buffer.from(raw, "base64");
}

export function microsoft365WebhookClientState(userId: string) {
  return createHmac("sha256", webhookKey()).update(`m365-webhook:${userId}`).digest("hex");
}

export function verifyMicrosoft365WebhookClientState(userId: string, value: unknown) {
  const expected = microsoft365WebhookClientState(userId);
  const actual = typeof value === "string" ? value : "";
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function webhookUrl(userId: string) {
  const base = String(process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://theouthaven.com").replace(/\/$/, "");
  const url = new URL("/api/integrations/microsoft-365/webhook", base);
  url.searchParams.set("userId", userId);
  return url.toString();
}

function normalizedResource(value: string) {
  return value.replace(/^\/+/, "").toLowerCase();
}

async function listSubscriptions(userId: string) {
  const subscriptions: GraphSubscription[] = [];
  let next: string | undefined = "/subscriptions?$top=100";
  let pages = 0;
  while (next && pages < 5) {
    const page: GraphCollection<GraphSubscription> = await microsoftGraphFetch<GraphCollection<GraphSubscription>>(userId, next);
    subscriptions.push(...(page.value || []));
    next = page["@odata.nextLink"];
    pages += 1;
  }
  return subscriptions;
}

async function desiredResources(userId: string) {
  const resources = [
    "me/mailFolders('Inbox')/messages",
    "me/events",
  ];
  const lists = await microsoftGraphFetch<GraphCollection<{ id?: string }>>(userId, "/me/todo/lists?$top=100");
  for (const list of lists.value || []) {
    if (list.id) resources.push(`/me/todo/lists/${list.id}/tasks`);
  }
  return resources;
}

async function createSubscription(userId: string, resource: string) {
  const url = webhookUrl(userId);
  const expirationDateTime = new Date(Date.now() + SUBSCRIPTION_LIFETIME_MS).toISOString();
  return microsoftGraphFetch<GraphSubscription>(userId, "/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      changeType: "created,updated,deleted",
      notificationUrl: url,
      lifecycleNotificationUrl: url,
      resource,
      expirationDateTime,
      clientState: microsoft365WebhookClientState(userId),
      latestSupportedTlsVersion: "v1_2",
    }),
  });
}

async function renewSubscription(userId: string, subscription: GraphSubscription) {
  const expirationDateTime = new Date(Date.now() + SUBSCRIPTION_LIFETIME_MS).toISOString();
  return microsoftGraphFetch<GraphSubscription>(userId, `/subscriptions/${encodeURIComponent(subscription.id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expirationDateTime }),
  });
}

export async function ensureMicrosoft365Subscriptions(userId: string) {
  const [existing, resources] = await Promise.all([listSubscriptions(userId), desiredResources(userId)]);
  const url = webhookUrl(userId);
  let created = 0;
  let renewed = 0;
  let healthy = 0;

  for (const resource of resources) {
    const wanted = normalizedResource(resource);
    const current = existing.find((item) => normalizedResource(item.resource) === wanted && item.notificationUrl === url);
    if (!current) {
      await createSubscription(userId, resource);
      created += 1;
      continue;
    }
    const expiresAt = current.expirationDateTime ? Date.parse(current.expirationDateTime) : 0;
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now() + RENEW_BEFORE_MS) {
      await renewSubscription(userId, current);
      renewed += 1;
    } else {
      healthy += 1;
    }
  }

  return { resources: resources.length, created, renewed, healthy };
}
