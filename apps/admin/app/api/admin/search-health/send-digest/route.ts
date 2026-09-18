import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

function getFunctionUrl() {
  const explicit = process.env.SEARCH_HEALTH_DIGEST_FUNCTION_URL;
  if (explicit) return explicit;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return `${supabaseUrl}/functions/v1/admin-search-health-digest`;
}

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;

  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ success: false, error: "CRON_SECRET is not configured" }, { status: 500 });
    }
    const body = await req.json().catch(() => ({}));
    const response = await fetch(getFunctionUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": cronSecret,
      },
      body: JSON.stringify({
        source: "admin_manual",
        force: body.force !== false,
        hours: Number(body.hours ?? 24) || 24,
      }),
    });
    const payload = await response.json().catch(() => ({ success: false, error: response.statusText }));
    return NextResponse.json(payload, { status: response.ok ? 200 : response.status });
  } catch (error) {
    console.error("SEARCH_HEALTH_SEND_DIGEST_ERROR", error);
    return NextResponse.json({ success: false, error: "Failed to send Search Health digest" }, { status: 500 });
  }
}
