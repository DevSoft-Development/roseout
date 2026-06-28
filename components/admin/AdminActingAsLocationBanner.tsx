"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, ShieldAlert, X } from "lucide-react";
import AdminLocationQuickActions from "@/components/admin/AdminLocationQuickActions";

type Props = {
  locationId?: string | null;
  locationName?: string | null;
  locationType?: string | null;
  plan?: string | null;
  reservationAccess?: "free" | "pro" | string | null;
};

export default function AdminActingAsLocationBanner({
  locationId,
  locationName,
  locationType,
  plan,
  reservationAccess,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  if (!locationId) return null;

  const stopActing = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("adminLocationId");
    const query = params.toString();
    router.push(`${pathname}${query ? `?${query}` : ""}`);
  };

  const copyLocationId = async () => { await navigator.clipboard?.writeText(locationId); };

  return (
    <section className="sticky top-0 z-40 border-b border-amber-300/30 bg-amber-950/95 px-4 py-3 text-amber-50 shadow-xl backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-300 text-amber-950">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black">Admin Support Mode: Acting as {locationName || "selected location"}</p>
            <p className="truncate text-xs text-amber-100/75">
              {locationType || "Location"} · Plan: {plan || "Unknown"} · Reservations: {reservationAccess === "pro" ? "Pro" : "Not enabled"} · ID: {locationId}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminLocationQuickActions locationId={locationId} locationType={locationType} compact />
          <Link href={`/admin/dashboard/crm/${locationId}`} className="rounded-full bg-amber-200 px-3 py-1.5 text-xs font-black text-amber-950">
            Open Location Profile
          </Link>
          <button type="button" onClick={copyLocationId} className="inline-flex items-center gap-1 rounded-full border border-amber-100/25 px-3 py-1.5 text-xs font-black text-amber-50">
            <Copy className="h-3 w-3" /> Copy Location ID
          </button>
          <button type="button" onClick={stopActing} className="inline-flex items-center gap-1 rounded-full border border-amber-100/25 px-3 py-1.5 text-xs font-black text-amber-50">
            <X className="h-3 w-3" /> Stop Acting
          </button>
        </div>
      </div>
    </section>
  );
}
