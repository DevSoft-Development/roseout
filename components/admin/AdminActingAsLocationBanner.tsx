"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, ShieldAlert, X } from "lucide-react";
import AdminLocationQuickActions from "@/components/admin/AdminLocationQuickActions";

type Props = { locationId?: string | null; locationName?: string | null; locationType?: string | null; plan?: string | null; reservationAccess?: "free" | "pro" | string | null; };
export default function AdminActingAsLocationBanner({ locationId, locationName, locationType, plan, reservationAccess }: Props) {
  const pathname = usePathname(); const searchParams = useSearchParams(); const router = useRouter(); if (!locationId) return null;
  const stopActing = () => { window.sessionStorage.removeItem("reserveAdminLocationId"); const params = new URLSearchParams(searchParams.toString()); params.delete("adminLocationId"); const query = params.toString(); router.push(`${pathname}${query ? `?${query}` : ""}`); };
  const copyLocationId = async () => { await navigator.clipboard?.writeText(locationId); };
  return <section className="mb-3 rounded-2xl border border-amber-400/20 bg-[#17110a]/95 px-3 py-2.5 text-amber-50 shadow-lg">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-300/15 text-amber-300"><ShieldAlert className="h-4 w-4" /></div><div className="min-w-0"><p className="text-sm font-black">Admin Support Mode: {locationName || "selected location"}</p><p className="truncate text-[11px] text-amber-100/70">{locationType || "Location"} · Plan: {plan || "Unknown"} · Reservations: {reservationAccess === "pro" ? "Pro" : "Not enabled"} · ID: {locationId}</p></div></div>
      <div className="flex flex-wrap items-center gap-1.5"><AdminLocationQuickActions locationId={locationId} locationType={locationType} compact /><Link href={`/admin/dashboard/crm/${locationId}`} className="rounded-full bg-amber-200 px-2.5 py-1.5 text-[11px] font-black text-amber-950">Open Location Profile</Link><button type="button" onClick={copyLocationId} className="inline-flex items-center gap-1 rounded-full border border-amber-100/20 px-2.5 py-1.5 text-[11px] font-black"><Copy className="h-3 w-3" /> Copy ID</button><button type="button" onClick={stopActing} className="inline-flex items-center gap-1 rounded-full border border-amber-100/20 px-2.5 py-1.5 text-[11px] font-black"><X className="h-3 w-3" /> Stop Acting</button></div>
    </div>
  </section>;
}
