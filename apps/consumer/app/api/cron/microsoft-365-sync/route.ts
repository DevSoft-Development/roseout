import { NextRequest, NextResponse } from "next/server";

import { syncMicrosoft365WorkspaceForUser } from "@/lib/microsoft-365/sync-with-crm";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function syncUsers(userIds: string[]) {
  const results: Array<{ userId: string; ok: boolean; result?: unknown; error?: string }> = [];
  for (const userId of userIds) {
    try {
      const result = await syncMicrosoft365WorkspaceForUser(userId);
      results.push({ userId, ok: true, result });
    } catch (caught) {
      results.push({ userId, ok: false, error: caught instanceof Error ? caught.message.slice(0, 300) : "Sync failed" });
    }
  }
  return NextResponse.json({ ok: results.every((row) => row.ok), processed: results.length, results });
}

async function activeUserIds() {
  const { data: connections, error } = await supabaseAdmin
    .from("microsoft_365_connections")
    .select("user_id")
    .eq("status", "active")
    .limit(50);
  if (error) throw error;
  return (connections || []).map((row) => String(row.user_id));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return syncUsers(await activeUserIds());
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("microsoft_365_connections")
    .select("user_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data?.user_id) return NextResponse.json({ ok: true, processed: 0, skipped: true, reason: "connection_inactive" });
  return syncUsers([userId]);
}
