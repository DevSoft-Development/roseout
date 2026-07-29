import { LocationToolShell, ToolCard } from "@/components/admin/location-tools/LocationToolShell";
import { ProfileRunActions } from "@/components/admin/location-tools/ProfileRunActions";
import { ProfileRunLiveRefresh } from "@/components/admin/location-tools/ProfileRunLiveRefresh";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({ params }: { params: Promise<{ runId: string }> }) {
  noStore();
  await requireAdminRole(["superadmin", "admin"]);
  const { runId } = await params;

  const [runResult, items] = await Promise.all([
    supabaseAdmin.from("location_search_profile_runs").select("*").eq("id", runId).maybeSingle(),
    supabaseAdmin
      .from("location_search_profile_run_items")
      .select("id,location_id,status,attempts,max_attempts,last_error,result,started_at,completed_at,updated_at")
      .eq("run_id", runId)
      .order("created_at")
      .limit(250),
  ]);

  if (runResult.error || items.error) {
    throw new Error(runResult.error?.message ?? items.error?.message ?? "Unable to load profile run");
  }
  if (!runResult.data) notFound();

  const run = runResult.data;
  const target = Number(run.target_count ?? 0);
  const processed = Number(run.processed_count ?? 0);
  const percent = target ? Math.min(100, Math.round((processed / target) * 100)) : 0;
  const pendingItems = (items.data ?? []).filter((item) => item.status === "pending").length;
  const processingItems = (items.data ?? []).filter((item) => item.status === "processing").length;

  return (
    <LocationToolShell
      title="Profile Backfill Run"
      description={`Run ${run.id}`}
      stats={[
        { label: "Status", value: run.status },
        { label: "Target", value: target },
        { label: "Processed", value: processed },
        { label: "Succeeded", value: Number(run.succeeded_count ?? 0) },
        { label: "Failed", value: Number(run.failed_count ?? 0) },
        { label: "Skipped", value: Number(run.skipped_count ?? 0) },
        { label: "Needs Review", value: Number(run.needs_review_count ?? 0) },
        { label: "Progress", value: `${percent}%` },
      ]}
    >
      <ToolCard title="Controls">
        <ProfileRunActions runId={run.id} status={run.status} />
        <ProfileRunLiveRefresh status={run.status} />

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          <div className="h-3 bg-white/5">
            <div
              className="h-full rounded-r-full bg-gradient-to-r from-rose-500 to-emerald-400 transition-[width] duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 p-3 text-xs text-white/55">
            <span>{processed.toLocaleString()} of {target.toLocaleString()} processed</span>
            <span>{processingItems} processing</span>
            <span>{pendingItems} pending in displayed batch</span>
          </div>
        </div>

        <dl className="mt-5 grid gap-2 text-sm text-white/60">
          <div>Started: {run.started_at ?? "—"}</div>
          <div>Completed: {run.completed_at ?? "—"}</div>
          <div>Requested by: {run.requested_by ?? "—"}</div>
          <div>Last database update: {run.updated_at ?? "—"}</div>
          <div>Filters: <code>{JSON.stringify(run.filters)}</code></div>
          <div>Configuration: <code>{JSON.stringify(run.configuration)}</code></div>
        </dl>
      </ToolCard>

      <ToolCard title="Items">
        <div className="space-y-2">
          {(items.data ?? []).map((item) => (
            <div
              key={item.id}
              className="grid gap-2 rounded-xl border border-white/10 p-3 text-sm sm:grid-cols-[1fr_auto]"
            >
              <span>
                <code>{item.location_id}</code>
                {item.last_error ? (
                  <span className="block text-red-200">{JSON.stringify(item.last_error)}</span>
                ) : null}
              </span>
              <strong>
                {item.status} · attempt {Number(item.attempts ?? 0)}/{Number(item.max_attempts ?? 3)}
              </strong>
            </div>
          ))}
        </div>
      </ToolCard>
    </LocationToolShell>
  );
}
