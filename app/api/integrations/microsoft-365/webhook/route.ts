import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyMicrosoft365WebhookClientState } from "@/lib/microsoft-365/subscriptions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function validUserId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: NextRequest) {
  const validationToken = request.nextUrl.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const userId = request.nextUrl.searchParams.get("userId")?.trim() || "";
  if (!validUserId(userId)) return NextResponse.json({ error: "Invalid notification target." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const notifications = Array.isArray(body?.value) ? body.value : [];
  if (!notifications.length) return NextResponse.json({ accepted: true, queued: false }, { status: 202 });

  const authentic = notifications.every((item: any) => verifyMicrosoft365WebhookClientState(userId, item?.clientState));
  if (!authentic) return NextResponse.json({ error: "Invalid notification state." }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("microsoft_365_connections")
    .update({ webhook_wake_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "active")
    .select("user_id")
    .maybeSingle();
  if (error) {
    console.error("Microsoft Graph webhook wake failed", { userId, error: error.message });
    return NextResponse.json({ error: "Unable to queue Microsoft 365 sync." }, { status: 500 });
  }

  return NextResponse.json({ accepted: true, queued: Boolean(data?.user_id) }, { status: 202 });
}
