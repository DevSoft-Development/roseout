"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink } from "lucide-react";
import { getReserveBookingUrl, getReserveDashboardUrl, getReserveEmbedUrl, getReservePublicProfileUrl } from "@/lib/reservations/reserveLinks";

type Props = { locationId: string; className?: string; compact?: boolean; locationType?: string | null };

export default function AdminLocationQuickActions({ locationId, className = "", compact = false, locationType = "restaurant" }: Props) {
  const [copied, setCopied] = useState(false);
  if (!locationId) return null;
  const scoped = (href: string) => `${href}${href.includes("?") ? "&" : "?"}adminLocationId=${encodeURIComponent(locationId)}`;
  const itemClass = compact ? "rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-[11px] font-black text-white/75 hover:bg-white hover:text-black" : "rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-white/80 hover:bg-white hover:text-black";
  const actions = [
    { label: "Host View", href: scoped(getReserveDashboardUrl("today")) },
    { label: "Booking Page", href: getReserveBookingUrl(locationId, locationType || "restaurant") },
    { label: "Embed Code", href: scoped(getReserveDashboardUrl("settings", "embed")) },
    { label: "Layout Builder", href: scoped(getReserveDashboardUrl("settings", "layout")) },
    { label: "Availability", href: scoped(getReserveDashboardUrl("settings", "hours")) },
    { label: "Guest List", href: scoped(getReserveDashboardUrl("guests")) },
    { label: "Location Profile", href: `/admin/dashboard/crm/${encodeURIComponent(locationId)}` },
  ];
  const copyLocationId = async () => { await navigator.clipboard?.writeText(locationId); setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
  return <div className={`flex flex-wrap gap-2 ${className}`}>{actions.map((action) => <Link key={action.label} href={action.href} className={itemClass}>{action.label}</Link>)}<a href={getReservePublicProfileUrl(locationId)} target="_blank" rel="noreferrer" className={compact ? "inline-flex items-center gap-1 rounded-full border border-rose-200/20 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-black text-rose-50" : "inline-flex items-center gap-1 rounded-full border border-rose-200/20 bg-rose-500/10 px-3 py-2 text-xs font-black text-rose-50"}>Public Page <ExternalLink className="h-3 w-3" /></a><a href={getReserveEmbedUrl(locationId)} target="_blank" rel="noreferrer" className={itemClass}>Open Embed <ExternalLink className="h-3 w-3 inline" /></a><button type="button" onClick={copyLocationId} className={compact ? "inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1.5 text-[11px] font-black text-white/70" : "inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-2 text-xs font-black text-white/70"}><Copy className="h-3 w-3" /> {copied ? "Copied." : "Copy ID"}</button></div>;
}
