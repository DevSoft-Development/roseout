import type { Metadata } from "next";
import Link from "next/link";
import ReserveEnterpriseHostShell from "@/components/reserve/ReserveEnterpriseHostShell";

export const metadata: Metadata = {
  title: "Reserve Dashboard | TheOutHaven",
  description: "Manage live reservations, floor flow, guests, waitlist, and service operations.",
};

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;
type Props = {
  searchParams?: Promise<Record<string, SearchValue>> | Record<string, SearchValue>;
};

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function preserveContext(params: Record<string, SearchValue>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else query.set(key, value);
  }
  return query;
}

export default async function ReserveDashboardPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const locationId = first(params.adminLocationId) || first(params.locationId) || "";

  if (!locationId) {
    return (
      <main className="min-h-screen bg-[#050607] px-4 py-16 text-white sm:px-6">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-white/10 bg-[#0a0c10] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6b86]">TheOutHaven Reserve</p>
          <h1 className="mt-2 text-3xl font-black">Choose a location to open Reserve</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-white/55">
            Reserve now runs on its dedicated surface and needs a location context before the live floor can load.
          </p>
          <Link
            href="https://business.theouthaven.com/locations/dashboard"
            className="mt-5 inline-flex rounded-xl bg-[#e1062a] px-4 py-3 text-sm font-black text-white"
          >
            Open Location Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const query = preserveContext(params);
  query.set(first(params.adminLocationId) ? "adminLocationId" : "locationId", locationId);
  const settingsHref = `/reserve/dashboard/location-layout?${query.toString()}`;

  return (
    <main className="min-h-screen bg-[#050607] text-white">
      <div className="sticky top-0 z-[70] flex min-h-14 items-center justify-between gap-3 border-b border-white/10 bg-[#07090d]/95 px-3 py-2 backdrop-blur-xl sm:px-5">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">TheOutHaven Reserve</p>
          <p className="truncate text-sm font-black text-white">Live Host View</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={settingsHref}
            className="rounded-full border border-white/12 bg-white/[0.045] px-3 py-2 text-[11px] font-black text-white/75"
          >
            Floor layout
          </Link>
          <Link
            href="https://business.theouthaven.com/locations/dashboard"
            className="rounded-full border border-white/12 bg-white/[0.045] px-3 py-2 text-[11px] font-black text-white/75"
          >
            Location dashboard
          </Link>
        </div>
      </div>
      <ReserveEnterpriseHostShell locationId={locationId} />
    </main>
  );
}
