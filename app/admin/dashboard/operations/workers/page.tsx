import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type JobRow = { id: string; job_type: string; status: string; attempt_count: number; max_attempts: number; progress_current: number; progress_total: number | null; last_error: string | null; created_at: string; updated_at: string; created_by_label: string | null };

export default async function WorkerOperationsPage() {
  const [{ data: jobs }, { data: counts }] = await Promise.all([
    supabaseAdmin.from("worker_jobs").select("id,job_type,status,attempt_count,max_attempts,progress_current,progress_total,last_error,created_at,updated_at,created_by_label").order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("worker_jobs").select("status"),
  ]);
  const totals = (counts || []).reduce<Record<string, number>>((acc, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {});
  return <main className="space-y-6 p-6"><div><h1 className="text-2xl font-semibold">Worker operations</h1><p className="text-sm text-muted-foreground">Durable Supabase Edge worker queue status, failures, progress, and retry/cancel entry points.</p></div><section className="grid grid-cols-2 gap-3 md:grid-cols-6">{["queued","running","succeeded","failed","dead_letter","cancelled"].map((status)=><div key={status} className="rounded-lg border p-4"><div className="text-xs uppercase text-muted-foreground">{status}</div><div className="text-2xl font-semibold">{totals[status] || 0}</div></div>)}</section><section className="overflow-x-auto rounded-lg border"><table className="min-w-full text-sm"><thead><tr className="border-b bg-muted/40 text-left"><th className="p-3">Job</th><th className="p-3">Status</th><th className="p-3">Progress</th><th className="p-3">Attempts</th><th className="p-3">Created by</th><th className="p-3">Updated</th><th className="p-3">Last error</th></tr></thead><tbody>{((jobs || []) as JobRow[]).map((job)=><tr key={job.id} className="border-b align-top"><td className="p-3"><div className="font-medium">{job.job_type}</div><code className="text-xs">{job.id}</code></td><td className="p-3">{job.status}</td><td className="p-3">{job.progress_current}/{job.progress_total ?? "?"}</td><td className="p-3">{job.attempt_count}/{job.max_attempts}</td><td className="p-3">{job.created_by_label || "—"}</td><td className="p-3">{new Date(job.updated_at).toLocaleString()}</td><td className="max-w-md p-3 text-red-600">{job.last_error || "—"}</td></tr>)}</tbody></table></section></main>;
}
