import Link from "next/link";
import UserDashboardShell, { DashboardCard } from "@/components/user/UserDashboardShell";
import { EmptyState, CompactStatusBadge } from "@/components/ui/mobile";
import { getCurrentUserDashboardContext } from "@/lib/user-dashboard";

export const dynamic = "force-dynamic";

function readableStatus(status: unknown) {
  const value = typeof status === "string" ? status.replaceAll("_", " ") : "saved";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default async function Page() {
  const ctx = await getCurrentUserDashboardContext();
  const plans = ctx.savedOutings || [];

  return (
    <UserDashboardShell isBeta={ctx.isBeta}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">Saved</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Saved Outings</h1>
          <p className="mt-2 text-sm font-semibold text-white/60">Plans you saved intentionally, ready to continue from any phone.</p>
        </div>
        <Link href="/create" className="inline-flex min-h-11 items-center justify-center rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white">Create outing</Link>
      </div>

      {!plans.length ? (
        <div className="mt-6">
          <EmptyState title="No saved outings yet" message="Search for a restaurant, activity, or full night out, then save the plan you like." action={<Link href="/create" className="inline-flex min-h-11 items-center justify-center rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white">Plan an outing</Link>} />
        </div>
      ) : (
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan: any) => (
            <DashboardCard key={plan.id} className="flex h-full flex-col p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <CompactStatusBadge tone="success">{readableStatus(plan.status)}</CompactStatusBadge>
                <span className="text-xs font-bold text-white/35">{plan.created_at ? new Date(plan.created_at).toLocaleDateString() : "Saved"}</span>
              </div>
              <h2 className="mt-3 line-clamp-2 text-xl font-black tracking-[-0.03em]">{plan.title || "TheOutHaven outing"}</h2>
              <p className="mt-2 line-clamp-3 text-sm font-semibold leading-6 text-white/60">{plan.summary || "Open this saved plan to review the places and continue the outing flow."}</p>
              <div className="mt-auto flex flex-col gap-2 pt-5 sm:flex-row">
                <Link href={`/user/dashboard/saved/${plan.id}`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-white px-4 py-2 text-xs font-black text-black">View details</Link>
                <Link href="/create" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/15 px-4 py-2 text-xs font-black text-white">Create similar</Link>
              </div>
            </DashboardCard>
          ))}
        </div>
      )}
    </UserDashboardShell>
  );
}
