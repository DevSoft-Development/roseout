import { supabaseAdmin } from "@/lib/supabase-admin";
import { WORKER_CATALOG } from "@/lib/workers/catalog";
import { JobActionButtons, RunWorkerButton } from "./WorkerActions";

export const dynamic = "force-dynamic";

type JobRow = {
  id: string;
  job_type: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  progress_current: number;
  progress_total: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  created_by_label: string | null;
};

const STATUSES = ["queued", "running", "succeeded", "failed", "dead_letter", "cancelled"] as const;

export default async function WorkerOperationsPage() {
  const [{ data: jobs, error: jobsError }, { data: counts, error: countsError }] = await Promise.all([
    supabaseAdmin
      .from("worker_jobs")
      .select("id,job_type,status,attempt_count,max_attempts,progress_current,progress_total,last_error,created_at,updated_at,created_by_label")
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin.from("worker_jobs").select("status"),
  ]);

  const totals = (counts || []).reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  const loadError = jobsError?.message || countsError?.message || null;

  return (
    <main className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Worker operations</h1>
        <p className="text-sm text-muted-foreground">
          Durable Supabase Edge worker queue status, failures, progress, and retry/cancel entry points.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          Worker data could not be loaded: {loadError}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {STATUSES.map((status) => (
          <div key={status} className="rounded-lg border p-4">
            <div className="text-xs uppercase text-muted-foreground">{status.replace("_", " ")}</div>
            <div className="text-2xl font-semibold">{totals[status] || 0}</div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Worker catalog</h2>
          <p className="text-sm text-muted-foreground">Run connected jobs on demand. Planned jobs remain disabled.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {WORKER_CATALOG.map((worker) => (
            <article key={worker.key} className="flex items-start justify-between gap-4 rounded-lg border p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{worker.label}</h3>
                  <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                    {worker.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{worker.description}</p>
                <p className="text-xs text-muted-foreground">{worker.family} · {worker.cadence}</p>
              </div>
              <RunWorkerButton jobType={worker.key} disabled={worker.status === "planned"} />
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-3">Job</th>
              <th className="p-3">Status</th>
              <th className="p-3">Progress</th>
              <th className="p-3">Attempts</th>
              <th className="p-3">Created by</th>
              <th className="p-3">Updated</th>
              <th className="p-3">Last error</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {((jobs || []) as JobRow[]).map((job) => (
              <tr key={job.id} className="border-b align-top">
                <td className="p-3">
                  <div className="font-medium">{job.job_type}</div>
                  <code className="text-xs">{job.id}</code>
                </td>
                <td className="p-3">{job.status}</td>
                <td className="p-3">{job.progress_current}/{job.progress_total ?? "?"}</td>
                <td className="p-3">{job.attempt_count}/{job.max_attempts}</td>
                <td className="p-3">{job.created_by_label || "—"}</td>
                <td className="p-3">{new Date(job.updated_at).toLocaleString()}</td>
                <td className="max-w-md p-3 text-red-600">{job.last_error || "—"}</td>
                <td className="p-3"><JobActionButtons id={job.id} status={job.status} /></td>
              </tr>
            ))}
            {!jobs?.length ? (
              <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No worker jobs yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}
