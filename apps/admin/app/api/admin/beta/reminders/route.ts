import { NextRequest, NextResponse } from "next/server";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { requireBetaAdmin, safeError } from "../_shared";
import { sendBetaRemindersForActiveTesters } from "@/lib/beta/reminderEmails";

const REMINDER_FIELDS = "id,tester_id,email,reminder_type,subject,status,week_start,weekly_required_tests,weekly_completed_tests,incomplete_task_count,sent_at,created_at" as const;
const REMINDER_TYPES = new Set(["weekly_tasks", "incomplete_tasks", "weekly_progress"]);

export async function GET() {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  const { data, error } = await getAdminDatabaseClient().from("beta_email_reminders").select(REMINDER_FIELDS).order("created_at", { ascending: false }).limit(300);
  if (error) return safeError();
  return NextResponse.json({ success: true, reminders: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  const reminderType = typeof body.reminderType === "string" && REMINDER_TYPES.has(body.reminderType) ? body.reminderType : "weekly_tasks";
  const results = await sendBetaRemindersForActiveTesters(reminderType);
  return NextResponse.json({ success: true, results });
}
