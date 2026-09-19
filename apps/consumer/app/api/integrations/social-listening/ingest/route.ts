import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ingestCommunityEvent, type CommunityProvider } from "@/lib/marketing/social-manager";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function signatureValid(raw: string, signature: string | null) {
  const secret = process.env.SOCIAL_LISTENING_WEBHOOK_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function provider(value: unknown): CommunityProvider | null {
  const normalized = String(value || "").toLowerCase();
  return ["instagram", "facebook", "tiktok", "youtube"].includes(normalized) ? normalized as CommunityProvider : null;
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!signatureValid(raw, request.headers.get("x-theouthaven-signature"))) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const { data: settings } = await supabaseAdmin.from("social_manager_settings").select("public_discovery_enabled").eq("scope", "platform").maybeSingle();
  if (!settings?.public_discovery_enabled) return NextResponse.json({ accepted: false, reason: "Public discovery is disabled." }, { status: 409 });

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!items.length) return NextResponse.json({ accepted: true, processed: 0 });
  if (items.length > 100) return NextResponse.json({ error: "Too many items." }, { status: 413 });

  const jobs = items.map((item: any) => {
    const network = provider(item.provider);
    const externalId = String(item.id || item.external_id || "").trim();
    const authorId = String(item.author_id || item.author?.id || "").trim();
    const body = String(item.text || item.body || "").trim();
    if (!network || !externalId || !authorId || !body) throw new Error("Listening item is missing provider, id, author_id, or text.");
    return ingestCommunityEvent({
      provider: network,
      externalUserId: authorId,
      username: item.username || item.author?.username || null,
      displayName: item.display_name || item.author?.display_name || null,
      externalMessageId: `listening:${externalId}`,
      externalThreadId: item.thread_id ? `listening:${String(item.thread_id)}` : `listening:${externalId}`,
      conversationType: "public_opportunity",
      body,
      sourcePostId: item.post_id || externalId,
      sourcePermalink: item.url || item.permalink || null,
      metadata: {
        listening_provider: String(payload.provider || request.headers.get("x-listening-provider") || "approved_vendor"),
        discovered_at: item.discovered_at || new Date().toISOString(),
        source_kind: "approved_social_listening",
      },
    });
  });

  const results = await Promise.allSettled(jobs);
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length) return NextResponse.json({ accepted: false, processed: results.length - failed.length, failed: failed.length, retry: true }, { status: 503 });
  return NextResponse.json({ accepted: true, processed: results.length, failed: 0 });
}
