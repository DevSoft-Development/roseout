import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PATCH(request: Request, { params }: { params: Promise<{ jobKey: string }> }) {
  const auth = await requireAdminApiRole(["admin", "superadmin"]);
  if (auth.error) return auth.error;
  const { jobKey } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  if ("job_key" in body || "jobKey" in body) return NextResponse.json({ success: false, error: "job_key cannot be changed." }, { status: 400 });
  const update: Record<string, unknown> = {};
  for (const key of ["send_success_email", "send_failure_email", "is_active"]) {
    if (key in body) {
      if (typeof body[key] !== "boolean") return NextResponse.json({ success: false, error: `${key} must be a boolean.` }, { status: 400 });
      update[key] = body[key];
    }
  }
  if ("email_recipients" in body) {
    if (!Array.isArray(body.email_recipients)) return NextResponse.json({ success: false, error: "email_recipients must be an array." }, { status: 400 });
    const emails = body.email_recipients.map((e: unknown) => String(e).trim()).filter(Boolean);
    if (emails.some((e: string) => !emailRe.test(e))) return NextResponse.json({ success: false, error: "email_recipients contains an invalid email." }, { status: 400 });
    update.email_recipients = emails;
  }
  if (!Object.keys(update).length) return NextResponse.json({ success: false, error: "No supported fields to update." }, { status: 400 });
  update.updated_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from("cron_jobs").update(update).eq("job_key", jobKey).select("*").maybeSingle();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ success: false, error: "Cron job not found." }, { status: 404 });
  return NextResponse.json({ success: true, job: data });
}
