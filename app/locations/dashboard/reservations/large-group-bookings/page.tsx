import Link from "next/link";
import { redirect } from "next/navigation";
import LargeGroupReviewActions, {
  REVIEW_MARKER,
} from "@/components/reserve/LargeGroupReviewActions";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import {
  parseDemoOwnerParams,
  requireDemoOwnerLocation,
  type DemoSearchParams,
} from "@/lib/demo/owner-context";

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTime(value: string | null) {
  if (!value) return "—";
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function reviewLabel(booking: any) {
  if (booking.status === "confirmed") return "Approved";
  if (booking.status === "declined") return "Declined";
  if (String(booking.special_request || "").includes(REVIEW_MARKER)) {
    return "Waiting for guest details";
  }
  return "Needs review";
}

function paymentLabel(value: unknown) {
  const mode = String(value || "none");
  if (mode === "card_guarantee") return "Card guarantee";
  if (mode === "deposit") return "Deposit";
  return "No payment required";
}

function paymentStatus(value: unknown) {
  const status = String(value || "").toLowerCase();
  if (!status) return "";
  const labels: Record<string, string> = {
    pending: "Pending",
    paid: "Paid",
    succeeded: "Paid",
    active: "Card secured",
    not_required: "Not required",
    released: "Released",
    failed: "Needs attention",
  };
  return labels[status] || status.replaceAll("_", " ");
}

export default async function LargeGroupBookingsPage({
  searchParams,
}: {
  searchParams?: Promise<DemoSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const parsedDemo = parseDemoOwnerParams(params);
  const requestedLocationId =
    first(params.adminLocationId) || first(params.locationId) || "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/locations/dashboard/reservations/large-group-bookings");
  }

  let locationId = requestedLocationId;
  if (parsedDemo.demo || first(params.fromDemoCenter) === "1") {
    const demo = await requireDemoOwnerLocation(params);
    locationId = String(demo.locationId || requestedLocationId);
  } else {
    const access = await getLocationOwnerAccess(user.id, user.email ?? null);
    if (
      locationId &&
      !access.isAdmin &&
      !access.ownedLocationIds.includes(locationId) &&
      !access.ownedSourceLocationIds.includes(locationId)
    ) {
      redirect("/locations/dashboard");
    }
    if (
      !access.isAdmin &&
      !access.ownedLocationIds.length &&
      !access.ownedSourceLocationIds.length
    ) {
      redirect("/create");
    }
    locationId =
      locationId ||
      access.ownedLocationIds[0] ||
      access.ownedSourceLocationIds[0] ||
      "";
  }

  const { data: bookings, error } = locationId
    ? await supabaseAdmin
        .from("location_reservations")
        .select(
          "id,location_id,location_type,customer_name,customer_email,customer_phone,reservation_date,reservation_time,party_size,status,occasion,prix_fixe_interest,group_booking_notes,special_request,large_group_payment_mode,deposit_status,guarantee_status,created_at",
        )
        .eq("location_id", locationId)
        .eq("booking_kind", "large_group")
        .order("reservation_date", { ascending: true })
        .order("reservation_time", { ascending: true })
        .limit(250)
    : { data: [], error: null };

  const context = new URLSearchParams();
  if (first(params.adminLocationId)) {
    context.set("adminLocationId", first(params.adminLocationId)!);
  } else if (locationId) {
    context.set("locationId", locationId);
  }
  if (first(params.type)) context.set("type", first(params.type)!);
  if (first(params.demo)) context.set("demo", first(params.demo)!);
  if (first(params.fromDemoCenter)) {
    context.set("fromDemoCenter", first(params.fromDemoCenter)!);
  }

  const query = context.toString();
  const backHref = `/locations/dashboard/reservations${query ? `?${query}` : ""}`;
  const settingsQuery = new URLSearchParams(context);
  settingsQuery.set("section", "policies");
  const settingsHref = `/locations/dashboard/reservations/settings?${settingsQuery.toString()}`;
  const pendingCount = (bookings || []).filter(
    (booking: any) => booking.status === "pending",
  ).length;

  return (
    <main className="min-h-screen bg-[#050607] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#090b0f] shadow-2xl">
          <div className="bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,.17),transparent_42%)] p-5 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff8aa0]">
                  TheOutHaven Reserve
                </p>
                <h1 className="mt-1 text-3xl font-black">Large-party reservations</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
                  Review large-party requests, confirm the ones you can accommodate, and follow up when you need more information.
                </p>
                {pendingCount ? (
                  <div className="mt-3 inline-flex rounded-full border border-[#e1062a]/25 bg-[#e1062a]/10 px-3 py-1.5 text-xs font-black text-[#ff8aa0]">
                    {pendingCount} {pendingCount === 1 ? "request needs" : "requests need"} review
                  </div>
                ) : (
                  <div className="mt-3 inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-black text-emerald-200">
                    All caught up
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={settingsHref}
                  className="reserve-soft rounded-full px-4 py-2.5 text-sm font-black"
                >
                  Policies & guarantees
                </Link>
                <Link
                  href={backHref}
                  className="reserve-primary rounded-full px-4 py-2.5 text-sm font-black"
                >
                  ← Reservations
                </Link>
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 font-bold text-red-100">
            We could not load large-party reservations. Please refresh the page and try again.
          </div>
        ) : bookings?.length ? (
          <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.03] shadow-[0_16px_50px_rgba(0,0,0,.2)]">
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-left text-sm">
                <thead className="border-b border-white/10 bg-white/[0.04] text-xs text-white/50">
                  <tr>
                    <th className="px-4 py-3 font-black">Guest</th>
                    <th className="px-4 py-3 font-black">Reservation</th>
                    <th className="px-4 py-3 font-black">Party size</th>
                    <th className="px-4 py-3 font-black">Status</th>
                    <th className="px-4 py-3 font-black">Occasion</th>
                    <th className="px-4 py-3 font-black">Payment protection</th>
                    <th className="px-4 py-3 font-black">Contact</th>
                    <th className="px-4 py-3 font-black">Next step</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {bookings.map((booking: any) => {
                    const needsGuestDetails = String(
                      booking.special_request || "",
                    ).includes(REVIEW_MARKER);
                    return (
                      <tr key={booking.id} className="align-top hover:bg-white/[0.02]">
                        <td className="px-4 py-4">
                          <p className="font-black">
                            {booking.customer_name || "Guest"}
                          </p>
                          {booking.group_booking_notes ? (
                            <p className="mt-1 max-w-xs text-xs leading-5 text-white/50">
                              {booking.group_booking_notes}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 font-bold">
                          {formatDate(booking.reservation_date)}
                          <br />
                          <span className="text-white/60">
                            {formatTime(booking.reservation_time)}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-black">
                          {booking.party_size || "—"}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${
                              booking.status === "confirmed"
                                ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-200"
                                : booking.status === "declined"
                                  ? "border-red-300/20 bg-red-500/10 text-red-200"
                                  : needsGuestDetails
                                    ? "border-[#e1062a]/25 bg-[#e1062a]/10 text-[#ff8aa0]"
                                    : "border-white/10 bg-white/[0.06] text-white/75"
                            }`}
                          >
                            {reviewLabel(booking)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {booking.occasion || "Not specified"}
                        </td>
                        <td className="px-4 py-4 text-xs">
                          <p className="font-black">
                            {paymentLabel(booking.large_group_payment_mode)}
                          </p>
                          {booking.deposit_status ? (
                            <p className="mt-1 text-white/50">
                              Deposit: {paymentStatus(booking.deposit_status)}
                            </p>
                          ) : null}
                          {booking.guarantee_status &&
                          booking.guarantee_status !== "not_required" ? (
                            <p className="mt-1 text-white/50">
                              Card: {paymentStatus(booking.guarantee_status)}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-xs">
                          <p className="break-all">
                            {booking.customer_email || "No email"}
                          </p>
                          <p className="mt-1 text-white/50">
                            {booking.customer_phone || "No phone"}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <LargeGroupReviewActions
                            reservationId={booking.id}
                            locationId={booking.location_id}
                            locationType={booking.location_type || "restaurant"}
                            adminLocationId={
                              first(params.adminLocationId) || undefined
                            }
                            currentStatus={booking.status || "pending"}
                            currentSpecialRequest={booking.special_request}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-8 text-center">
            <h2 className="text-xl font-black">No large-party reservations yet</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-white/60">
              New large-party requests will appear here automatically when guests submit them.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
