import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const MAX_RECOVERY_ROWS = 250;

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "manager"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "run_now") {
      const limit = Math.max(1, Math.min(Number(body?.limit || 100), 250));
      const secret = process.env.CRON_SECRET?.trim();
      if (!secret) {
        return Response.json({ success: false, error: "CRON_SECRET is not configured." }, { status: 500 });
      }

      const origin = new URL(request.url).origin;
      const response = await fetch(`${origin}/api/cron/search-anchor-reconciliation?limit=${limit}`, {
        method: "GET",
        headers: { authorization: `Bearer ${secret}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      return Response.json(payload, { status: response.status });
    }

    const sourceStatus =
      action === "retry_failed"
        ? "failed"
        : action === "requeue_dead_letter"
          ? "dead_letter"
          : null;

    if (!