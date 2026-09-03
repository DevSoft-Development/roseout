import { NextRequest, NextResponse } from "next/server";

import { ensureMicrosoft365Subscriptions } from "@/lib/microsoft-365/subscriptions";
import { syncMicrosoft365WorkspaceForUser } from "@/lib/microsoft-365/sync-with-crm";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret;
}

async function isActiveConnection(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("microsoft_365_connections")
    .select("user_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.user_id);
}

async function syncOne(userId: string) {
  const subscriptions = await ensureMicrosoft365Subscriptions(userId);
  const sync = await syncMicrosoft365WorkspaceForUser(userId);
  return { userId, subscriptions, sync };
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.user_id || body?.userId || "").trim();
  if (!userId) return NextResponse.json({ ok: false, error: "user_id is required" }, { status: 400 });
  if (!(await isActiveConnection(userId))) {
    return NextResponse.json({ ok: true, processed: 0, skipped: true, reason: "connection_not_active" });
  }

  try {
    const result = await syncOne(userId);
    return NextResponse.json({ ok: true, processed: 1, result });
  } catch (caught) {
    return NextResponse.json({
      ok: false,
      processed: 1,
      error: caught instanceof Error ? caught.message.slice(0, 500) : "Sync failed",
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: connections, error } = await supabaseAdmin
    .from("microsoft_365_connections")
    .select("user_id")
    .eq("status", "active")
    .limit(50);
  if (error) throw error;

  const results: Array<{ userId: string; ok: boolean; error?: string; subscriptions?: unknown; sync?: unknown }> = [];
  for (const connection of connections || []) {
    try {
      const result = await syncOne(connection.user_id);
      results.push({ ...result, ok: true });
    } catch (caught) {
      results.push({ userId: connection.user_id, ok: false, error: caught instanceof Error ? caught.message.slice(0, 300) : "Sync failed" });
    }
  }
  return NextResponse.json({ ok: results.every((row) => row.ok), processed: results.length, results });
}
