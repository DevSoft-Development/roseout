import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { sendBrandedEmail } from "@/lib/email/sender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DigestType = "superadmin_daily" | "superadmin_weekly" | "reservation_daily" | "reservation_weekly";
const map = {
  superadmin_daily: { key: "superadmin_daily_dashboard", department: "superadmin" },
  superadmin_weekly: { key: "superadmin_weekly_dashboard", department: "superadmin" },
  reservation_daily: { key: "reservation_daily_summary", department: "reservations" },
  reservation_weekly: { key: "reservation_weekly_summary", department: "reservations" },
} as const;

export async function POST(req: Request) {
  const body = await req.json();
  const secretOk = body.secret && (body.secret === process.env.CRON_SECRET || body.secret === process.env.ADMIN_DIGEST_SECRET);
  if (!secretOk) {
    const auth = await requireAdminApiRole(["admin", "superadmin"]);
    if (auth.error) return auth.error;
  }
  const type = body.type as DigestType;
  if (!map[type]) return NextResponse.json({ error: "Invalid digest type" }, { status: 400 });
  const to = body.toEmail || process.env.SUPERADMIN_EMAIL || process.env.ADMIN_ALERT_EMAIL;
  if (!to) return NextResponse.json({ success: false, skipped: true, errors: ["No recipient configured"] });
  const result = await sendBrandedEmail({ to, templateKey: map[type].key, department: map[type].department, input: { metrics: body.metrics || [], alerts: body.alerts || [] } });
  return NextResponse.json({ success: result.status !== "error", skipped: result.status === "skipped", errors: result.error ? [result.error] : [], result });
}
