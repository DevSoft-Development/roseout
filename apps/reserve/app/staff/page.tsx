import type { Metadata } from "next";
import Link from "next/link";
import ReserveStaffSignIn from "@/components/reserve/ReserveStaffSignIn";

export const metadata: Metadata = {
  title: "Reserve Staff Sign In | TheOutHaven",
  description: "Secure staff PIN sign in for TheOutHaven Reserve.",
};

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReserveStaffPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchValue>> | Record<string, SearchValue>;
}) {
  const params = searchParams ? await searchParams : {};
  const locationId = first(params.locationId) || first(params.adminLocationId) || "";

  return (
    <main className="min-h-screen bg-[#050607] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff6b86]">TheOutHaven Reserve</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Staff access</h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/50">
            Authorized front-desk devices stay signed into Reserve. Each employee uses their own PIN so activity is tied to the correct staff member.
          </p>
        </div>

        {locationId ? (
          <ReserveStaffSignIn locationId={locationId} />
        ) : (
          <div className="rounded-[1.75rem] border border-white/10 bg-[#0a0c10] p-6">
            <h2 className="text-xl font-black">Open a location first</h2>
            <p className="mt-2 text-sm font-semibold text-white/50">
              Staff sign in needs a location context. Open Reserve from that location&apos;s Business dashboard.
            </p>
            <Link
              href="https://business.theouthaven.com/locations/dashboard"
              className="mt-5 inline-flex rounded-xl bg-[#e1062a] px-4 py-3 text-sm font-black text-white"
            >
              Open Business dashboard
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
