import Link from "next/link";
import UserDashboardShell, {
  DashboardCard,
} from "@/components/user/UserDashboardShell";
import { EmptyState, CompactStatusBadge } from "@/components/ui/mobile";
import { getCurrentUserDashboardContext } from "@/lib/user-dashboard";

export const dynamic = "force-dynamic";

function label(status: unknown) {
  const v =
    typeof status === "string" && status
      ? status.replaceAll("_", " ")
      : "Planning";
  return v.charAt(0).toUpperCase() + v.slice(1);
}
function tone(
  status: unknown,
): "neutral" | "success" | "warning" | "danger" | "info" {
  const v = String(status || "").toLowerCase();
  if (v.includes("complete")) return "success";
  if (v.includes("cancel")) return "danger";
  if (v.includes("confirm") || v.includes("book")) return "info";
  return "neutral";
}

export default async function Page() {
  const ctx = await getCurrentUserDashboardContext();
  const outings = ctx.bookedOutings || [];
  return (
    <UserDashboardShell isBeta={ctx.isBeta}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[.25em] text-rose-200">
            Outings
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-4xl">
            My Outings
          </h1>
          <p className="mt-2 text-sm font-semibold text-white/60">
            Your saved and booked TheOutHaven plans in one place.
          </p>
        </div>
        <Link
          href="/create"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-rose-600 px-5 py-3 text-sm font-black"
        >
          Create outing
        </Link>
      </div>
      {!outings.length ? (
        <div className="mt-6">
          <EmptyState
            title="No booked outings yet"
            message="When you save or complete a booking from the plan page, your outing will appear here."
            action={
              <Link
                href="/create"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-rose-600 px-5 py-3 text-sm font-black"
              >
                Create an outing
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {outings.map((o: any) => (
            <DashboardCard
              key={o.id}
              className="flex h-full flex-col p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <CompactStatusBadge tone={tone(o.status)}>
                  {label(o.status)}
                </CompactStatusBadge>
                <span className="text-xs font-bold text-white/35">
                  {o.booked_at
                    ? new Date(o.booked_at).toLocaleDateString()
                    : o.created_at
                      ? new Date(o.created_at).toLocaleDateString()
                      : "Saved"}
                </span>
              </div>
              <h2 className="mt-3 line-clamp-2 text-xl font-black">
                {o.title || o.restaurant_name || "TheOutHaven Outing"}
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-white/60">
                {o.restaurant_name || "Restaurant TBD"}
                {o.activity_name ? ` + ${o.activity_name}` : ""}
              </p>
              <Link
                href={`/user/dashboard/outings/${o.id}`}
                className="mt-auto inline-flex min-h-11 items-center justify-center rounded-full bg-white px-4 py-2 text-xs font-black text-black"
              >
                View details
              </Link>
            </DashboardCard>
          ))}
        </div>
      )}
    </UserDashboardShell>
  );
}
