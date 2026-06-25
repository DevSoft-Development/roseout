import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { ok } from "./response.ts";
import { logCronJobRun } from "./cronLogger.ts";

export const inactiveStatuses = new Set(["cancelled", "completed", "no_show", "declined"]);
export function escapeHtml(value: unknown) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
export function formatDate(value: unknown) { if (!value) return "—"; const date = new Date(String(value)); if (Number.isNaN(date.getTime())) return String(value); return date.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", year: "numeric" }); }
export function formatTime(value: unknown) { const text = String(value ?? "").slice(0, 5); const [h, m] = text.split(":").map(Number); if (!Number.isFinite(h)) return String(value ?? "—"); const hour = h % 12 || 12; return `${hour}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; }
export function recipientFrom(keys: string[]) { for (const key of keys) { const value = Deno.env.get(key); if (value?.trim()) return value.trim(); } return null; }
export async function isJobActive(supabase: SupabaseClient, jobKey: string) { const { data, error } = await supabase.from("cron_jobs").select("is_active").eq("job_key", jobKey).maybeSingle(); if (error) return true; return data?.is_active !== false; }
export async function returnIfDisabled(supabase: SupabaseClient, jobKey: string, startedAt: string, duration: () => number): Promise<Response | null> { if (await isJobActive(supabase, jobKey)) return null; await logCronJobRun(supabase, { job_name: jobKey, job_key: jobKey, function_name: jobKey, route_path: `supabase/functions/${jobKey}`, source: "edge_function", status: "skipped", started_at: startedAt, finished_at: new Date().toISOString(), duration_ms: duration(), skipped_count: 1, message: `${jobKey} skipped because job is paused.`, metadata: { reason: "job_disabled" } }); return ok({ success: true, skipped: true, reason: "job_disabled" }); }
export function successRate(success: number, failed: number, skipped = 0) { const total = success + failed + skipped; return total ? success / total : null; }
