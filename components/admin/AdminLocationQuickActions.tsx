"use client";

import Link from "next/link";
import { Copy, ExternalLink } from "lucide-react";

type Props = {
  locationId: string;
  className?: string;
  compact?: boolean;
};

function buildScoped(path: string, locationId: string) {
  const params = new URLSearchParams({ adminLocationId: locationId });
  return `${path}?${params.toString()}`;
}

const actions = [
  { label: "Host View", path: "/reserve/dashboard/reservations" },
  { label: "Booking Page", path: "/reserve/dashboard/layout" },
  { label: "Embed Code", path: "/reserve/dashboard/layout" },
  { label: "Layout Builder", path: "/reserve/dashboard/location-layout" },
  { label: "Availability", path: "/reserve/dashboard/availability" },
  { label: "Guest List", path: "/reserve/dashboard/guests" },
  { label: "Location Profile", path: "/admin/dashboard/crm" },
];

export default function AdminLocationQuickActions({ locationId, className = "", compact = false }: Props) {
  if (!locationId) return null;

  const copyLocationId = async () => {
    await navigator.clipboard?.writeText(locationId);
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {actions.map((action) => {
        const href = action.path === "/admin/dashboard/crm" ? `${action.path}/${locationId}` : buildScoped(action.path, locationId);
        return (
          <Link
            key={action.label}
            href={href}
            className={compact ? "rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-[11px] font-black text-white/75 hover:bg-white hover:text-black" : "rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-white/80 hover:bg-white hover:text-black"}
          >
            {action.label}
          </Link>
        );
      })}
      <a
        href={`/reserve/location/${locationId}`}
        target="_blank"
        rel="noreferrer"
        className={compact ? "inline-flex items-center gap-1 rounded-full border border-rose-200/20 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-black text-rose-50" : "inline-flex items-center gap-1 rounded-full border border-rose-200/20 bg-rose-500/10 px-3 py-2 text-xs font-black text-rose-50"}
      >
        Public Page <ExternalLink className="h-3 w-3" />
      </a>
      <button
        type="button"
        onClick={copyLocationId}
        className={compact ? "inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1.5 text-[11px] font-black text-white/70" : "inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-2 text-xs font-black text-white/70"}
      >
        <Copy className="h-3 w-3" /> Copy ID
      </button>
    </div>
  );
}
