import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ingestCommunityEvent } from "@/lib/marketing/social-manager";

export const dynamic = "force-dynamic";

function verifySignature(rawBody: string, signature: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) return new Response(challenge, { status: 200 });
  return new Response("Verification failed", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid payload." }, { status: 400 }); }
  const jobs: Promise<unknown>[] = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      if (change.field === "comments" && value.id && value.text) {
        jobs.push(ingestCommunityEvent({ provider: "instagram", externalUserId: String(value.from?.id || value.username || "unknown"), username: value.from?.username || value.username || null, displayName: value.from?.name || null, externalMessageId: String(value.id), externalThreadId: String(value.media?.id || value.media_id || value.id), conversationType: "comment", body: String(value.text), sourcePostId: value.media?.id || value.media_id || null, sourcePermalink: value.media?.permalink || null, metadata: { webhook_field: change.field, entry_id: entry.id } }));
      }
      if (change.field === "feed" && value.item === "comment" && value.comment_id && value.message) {
        jobs.push(ingestCommunityEvent({ provider: "facebook", externalUserId: String(value.from?.id || "unknown"), username: null, displayName: value.from?.name || null, externalMessageId: String(value.comment_id), externalThreadId: String(value.post_id || value.comment_id), conversationType: "comment", body: String(value.message), sourcePostId: value.post_id || null, metadata: { webhook_field: change.field, entry_id: entry.id } }));
      }
    }
    for (const event of entry.messaging || []) {
      const message = event.message;
      if (!message?.text || !event.sender?.id) continue;
      const provider = payload.object === "instagram" ? "instagram" : "facebook";
      jobs.push(ingestCommunityEvent({ provider, externalUserId: String(event.sender.id), externalMessageId: String(message.mid || `${event.sender.id}:${event.timestamp || Date.now()}`), externalThreadId: String(event.sender.id), conversationType: "dm", body: String(message.text), metadata: { recipient_id: event.recipient?.id || null, entry_id: entry.id } }));
    }
  }

  const results = await Promise.allSettled(jobs);
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length) {
    console.error("Meta Community webhook ingestion failed", {
      total: results.length,
      failed: failed.length,
      reasons: failed.map((result) => result.status === "rejected" ? String(result.reason) : "").slice(0, 5),
    });
    return NextResponse.json({ received: false, processed: results.length - failed.length, failed: failed.length, retry: true }, { status: 503 });
  }

  return NextResponse.json({ received: true, processed: results.length, failed: 0 });
}
