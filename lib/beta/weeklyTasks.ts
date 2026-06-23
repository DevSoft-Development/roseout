import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { BetaTesterType } from "@/types/beta";

export function getCurrentWeekStart(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

const rotating: Record<string, string[]> = {
  user: ["/create?betaTask=user-weekly", "/locations?betaTask=user-location-review"],
  location_owner: ["/location/dashboard?betaTask=owner-dashboard", "/claim?betaTask=claim-flow", "/location/dashboard/reservations?betaTask=reservation-dashboard", "/location/dashboard/embed?betaTask=embed-code"],
  ambassador: ["/admin/dashboard/crm?betaTask=ambassador-crm", "/admin/dashboard/knowledge-base?betaTask=ambassador-kb", "/admin/dashboard/settings/promo-codes?betaTask=promo-code-test"],
  experience_team: ["/admin/dashboard/beta?tab=feedback", "/admin/dashboard/beta?tab=bugs", "/admin/dashboard/beta?tab=search-speed", "/admin/dashboard/logs"],
  admin: ["/admin/dashboard/beta", "/admin/dashboard/beta?tab=search-speed", "/admin/dashboard/beta/search-lab", "/admin/dashboard/import", "/admin/dashboard/logs"],
  superadmin: ["/admin/dashboard/beta", "/admin/dashboard/beta?tab=search-speed", "/admin/dashboard/beta/search-lab", "/admin/dashboard/import", "/admin/dashboard/logs"],
};
export function getDefaultBetaTaskLinks(testerType: string) { return rotating[testerType] ?? rotating.user; }
export function getDefaultBetaPromptTasks(_testerType: string) { return ["Run one search and rate the results", "Try a near me search", "Open and review a location card", "Submit one feedback form", "Report one bug if something breaks"]; }

export const starterWeeklyTasks = [
  { title: "Run a full-sentence search", description: "Search naturally and rate whether the results make sense.", feature_area: "search_quality", priority: "high", test_url: "/create?betaTask=full-sentence-search", predefined_prompt: "date night with dinner and something fun near me", instructions: "Run one full-sentence search. Check if the results match the intent and area, then submit quick feedback.", email_summary: "Run one full-sentence search and rate the results.", sort_order: 1 },
  { title: "Test a location or market search", description: "Try a neighborhood or near-me search.", feature_area: "local_search", priority: "medium", test_url: "/create?betaTask=market-search", predefined_prompt: "things to do near me tonight", instructions: "Try one near-me, borough, or neighborhood search. Confirm whether the locations are relevant.", email_summary: "Try a near-me or neighborhood search.", sort_order: 2 },
  { title: "Open and review a location card", description: "Confirm one location page looks correct.", feature_area: "location_page", priority: "medium", test_url: "/locations?betaTask=location-card", predefined_prompt: null, instructions: "Open one location card. Check photos, address, categories, and overall page quality.", email_summary: "Open one location card and confirm the page looks correct.", sort_order: 3 },
  { title: "Submit feedback on search quality", description: "Tell us what worked or felt off.", feature_area: "feedback", priority: "high", test_url: "/user/dashboard/beta/feedback", predefined_prompt: null, instructions: "Submit one short feedback form about the search results or beta dashboard experience.", email_summary: "Submit one quick feedback form.", sort_order: 4 },
  { title: "Report an issue or confirm none found", description: "Report a bug if something breaks, or note that no issue was found.", feature_area: "bug_reports", priority: "medium", test_url: "/user/dashboard/beta/report-bug", predefined_prompt: null, instructions: "If something breaks, submit a bug report. If nothing breaks, add a short note in feedback saying no issue found.", email_summary: "Report one issue if found, or confirm no issue found.", sort_order: 5 },
];

async function ensureDefaultTasks() {
  await createStarterWeeklyTasks({ weekStart: getCurrentWeekStart(), status: "active" });
}

export async function createStarterWeeklyTasks({ weekStart = getCurrentWeekStart(), createdBy = null, status = "draft" }: { weekStart?: string; createdBy?: string | null; status?: "draft" | "active" }) {
  const created: any[] = [];
  for (const task of starterWeeklyTasks) {
    const { data: existing } = await supabaseAdmin.from("beta_tasks").select("id").eq("week_start", weekStart).eq("title", task.title).maybeSingle();
    const row: any = { ...task, status, tester_type: "user", estimated_minutes: 10, week_start: weekStart, is_template: true, created_by: createdBy, prompt_mode: task.predefined_prompt ? "either" : "predefined", predefined_prompt: task.predefined_prompt, allow_custom_prompt: true, custom_prompt_required: false, button_label: "Start Task" };
    if (existing?.id) {
      const { data } = await supabaseAdmin.from("beta_tasks").update({ ...row, updated_at: new Date().toISOString() }).eq("id", existing.id).select("*").single();
      if (data) created.push(data);
    } else {
      const { data } = await supabaseAdmin.from("beta_tasks").insert(row).select("*").single();
      if (data) created.push(data);
    }
  }
  return created;
}

async function currentActiveTasks() {
  const weekStart = getCurrentWeekStart();
  let { data: tasks } = await supabaseAdmin.from("beta_tasks").select("*").eq("status", "active").eq("week_start", weekStart).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (!tasks?.length) {
    ({ data: tasks } = await supabaseAdmin.from("beta_tasks").select("*").eq("status", "active").order("created_at", { ascending: true }).limit(5));
  }
  return { tasks: tasks ?? [], weekStart };
}

export async function assignWeeklyBetaTasksForTester(testerId: string) {
  const { tasks, weekStart } = await currentActiveTasks();
  if (!tasks.length) return { assigned: 0, weekStart, noActiveTasks: true };
  const { data: tester } = await supabaseAdmin.from("beta_testers").select("*").eq("id", testerId).maybeSingle();
  if (!tester || !["active", "approved"].includes(String(tester.status))) return { assigned: 0, weekStart };
  const { data: existing } = await supabaseAdmin.from("beta_task_assignments").select("id,status").eq("tester_id", testerId).eq("assigned_week_start", weekStart);
  if ((existing?.length ?? 0) >= tasks.length) return { assigned: 0, weekStart };
  const links = getDefaultBetaTaskLinks(tester.tester_type as BetaTesterType);
  const existingCount = existing?.length ?? 0;
  const rows = tasks.slice(existingCount, 5).map((task: any, index: number) => ({
    task_id: task.id, tester_id: testerId, status: "assigned", assigned_week_start: weekStart, counts_toward_weekly_goal: true,
    test_url: task.test_url || links[index % links.length], assigned_prompt: task.predefined_prompt ?? null, prompt_mode: task.prompt_mode ?? "predefined", used_custom_prompt: false,
  }));
  if (rows.length) await supabaseAdmin.from("beta_task_assignments").upsert(rows, { onConflict: "task_id,tester_id,assigned_week_start", ignoreDuplicates: true });
  const completed = (existing ?? []).filter((a: any) => a.status === "completed").length;
  await supabaseAdmin.from("beta_testers").update({ current_week_start: weekStart, weekly_completed_tests: completed, weekly_required_tests: Math.min(5, tasks.length) }).eq("id", testerId);
  return { assigned: rows.length, weekStart };
}

export async function assignWeeklyBetaTasksForAllActiveTesters() {
  const { data } = await supabaseAdmin.from("beta_testers").select("id").in("status", ["active", "approved"]);
  const results = [];
  for (const tester of data ?? []) results.push(await assignWeeklyBetaTasksForTester(tester.id));
  return results;
}

export function createInviteCode() { return randomUUID().replace(/-/g, "").slice(0, 12); }
