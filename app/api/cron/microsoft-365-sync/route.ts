import { NextRequest, NextResponse } from "next/server";

import { syncMicrosoft365WorkspaceForUser } from "@/lib/microsoft-365/sync-with-crm";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: connections, error } = await supabaseAdmin
    .from("microsoft_365_connections")
    .select("user_id")
    .eq("status", "active")
    .limit(50);
  if (error) throw error;

  const results: Array<{ userId: string; ok: boolean; error?: string }> = [];
  for (const connection of connections || []) {
    try {
      await syncMicrosoft365WorkspaceForUser(connection.user_id);
      results.push({ userId: connection.user_id, ok: true });
    } catch (caught) {
      results.push({ userId: connection.user_id, ok: false, error: caught instanceof Error ? caught.message.slice(0, 300) : "Sync failed" });
    }
  }
  return NextResponse.json({ ok: results.every((row) => row.ok), processed: results.length, results });
}
