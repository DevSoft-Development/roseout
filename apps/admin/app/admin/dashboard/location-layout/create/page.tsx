import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";

export const metadata = {
  title: "Location Layout | TheOutHaven Admin",
  description: "Reservation floor-plan editing is managed by the separate TheOutHaven Reserve system.",
};

export default async function AdminLocationLayoutBoundaryPage() {
  await requireAdminRole(["superadmin", "admin", "manager"]);
  const reserveOrigin = (process.env.NEXT_PUBLIC_RESERVE_APP_URL || "").replace(/\/$/, "");
  const href = reserveOrigin ? `${reserveOrigin}/dashboard/location-layout/create` : "/reserve/dashboard/location-layout/create";
  return <main className="min-h-screen bg-[#08050b] p-6 text-white"><div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/[0.04] p-6">
    <p className="text-xs font-black uppercase tracking-[.24em] text-rose-300">System boundary</p>
    <h1 className="mt-2 text-3xl font-black">Reservation Location Layout</h1>
    <p className="mt-3 leading-7 text-white/60">Tables, booths, bars, lanes, rooms, occupancy, and reservation floor-plan editing belong to TheOutHaven Reserve. Admin does not host or duplicate that operational layout runtime.</p>
    <Link href={href} className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 font-black text-black">Open Reserve layout manager</Link>
  </div></main>;
}
