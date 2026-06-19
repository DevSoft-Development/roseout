"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MoreVertical, X } from "lucide-react";
import { AdminActionButton, AdminDataTableShell, AdminDetailPanel, AdminDetailSection, AdminEmptyState, AdminReadinessIndicator, AdminStatusBadge, formatAdminDate, formatAdminNumber } from "@/components/admin/AdminDesignSystem";
import { canOpenPublicLocationPage, getCrmPublicLocationHref } from "@/lib/location-url";

type Row = any;

function text(v: any) { return v == null || v === "" ? "—" : String(v).replace(/_/g, " "); }
function marketName(b: Row) { return text(b.market || b.location_market || b.borough || b.city || "Unknown"); }
function readiness(b: Row) {
  const vals = [b.sales_readiness_score, b.reservation_portal_readiness_score, b.readiness_score].map(Number).filter((n) => Number.isFinite(n));
  if (vals.length) return Math.round(vals.reduce((a, n) => a + n, 0) / vals.length);
  let score = 70; if (b.is_searchable) score += 10; if (b.google_place_id) score += 8; if (b.image_url || b.main_image) score += 5; if (b.claim_outreach_status === "approved") score += 7; return Math.min(100, score);
}
function status(b: Row) { return text(b.claim_outreach_status || b.partner_sales_status || b.crm_status || "Needs review"); }
function nextAction(b: Row) { return text(b.next_action || b.next_action_label || (b.is_searchable ? "Ready" : "Needs review")); }
function address(b: Row) { return text(b.address || [b.city || b.borough, b.state, b.zip || b.zip_code].filter(Boolean).join(", ")); }

export default function AdminCrmWorkspace({ businesses, empty, pageStart, pageEnd, total, pagination }: { businesses: Row[]; empty: React.ReactNode; pageStart: number; pageEnd: number; total: number; pagination: React.ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(businesses[0]?.id || null);
  const [panelOpen, setPanelOpen] = useState(true);
  const selected = useMemo(() => businesses.find((b) => b.id === selectedId) || businesses[0], [businesses, selectedId]);
  const publicHref = selected ? getCrmPublicLocationHref(selected) : null;
  const canViewPublic = Boolean(publicHref && selected && canOpenPublicLocationPage(selected));
  if (!businesses.length) return <AdminDataTableShell>{empty}</AdminDataTableShell>;
  return (
    <div className={`grid min-w-0 gap-5 ${panelOpen ? "2xl:grid-cols-[minmax(0,1fr)_360px]" : "2xl:grid-cols-1"}`}>
      <AdminDataTableShell>
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.18em] text-white/45"><tr>{["Location","Market","Status / Stage","Readiness","Analytics","Last Activity","Next Action"].map((h)=><th key={h} className="whitespace-nowrap px-3 py-3 font-black">{h}</th>)}</tr></thead>
          <tbody>
            {businesses.map((b) => {
              const active = b.id === selected?.id;
              return <tr key={b.id} tabIndex={0} onClick={() => { setSelectedId(b.id); setPanelOpen(true); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(b.id); setPanelOpen(true); } }} className={`cursor-pointer border-t border-white/10 align-top outline-none transition hover:bg-white/[0.035] focus:bg-white/[0.05] ${active ? "bg-rose-500/[0.04] ring-1 ring-inset ring-[#ec0b5b]/70" : ""}`}>
                <td className="max-w-[270px] px-3 py-4"><Link onClick={(e)=>e.stopPropagation()} href={`/admin/dashboard/crm/${b.id}`} className="font-black text-white hover:text-rose-100">{b.name}</Link><p className="mt-1 line-clamp-2 text-xs leading-5 text-white/50">{address(b)}</p><p className="mt-1 truncate text-xs text-white/35">{text(b.location_type || b.category || b.primary_category || "Location")}</p></td>
                <td className="px-3 py-4"><AdminStatusBadge>{marketName(b)}</AdminStatusBadge></td>
                <td className="px-3 py-4"><div className="flex flex-col gap-1.5"><AdminStatusBadge tone={String(status(b)).includes("approved") || b.is_searchable ? "green" : "rose"}>{status(b)}</AdminStatusBadge><span className="text-xs text-white/55">{text(b.discovery_status || b.discovery_profile_status || "Free Discovery")}</span><span className="text-xs text-white/40">Searchable: {b.is_searchable ? "Yes" : "No"}</span></div></td>
                <td className="px-3 py-4"><AdminReadinessIndicator score={readiness(b)} /></td>
                <td className="whitespace-nowrap px-3 py-4 text-xs text-white/60"><div>Reservations {formatAdminNumber(b.reservation_completions_30d || 0)}</div><div>Views: {formatAdminNumber(b.profile_views_30d || 0)}</div><div>Search: {formatAdminNumber(b.search_appearances_30d || 0)}</div></td>
                <td className="whitespace-nowrap px-3 py-4 text-xs text-white/60"><div>{formatAdminDate(b.last_contacted_at || b.updated_at || b.created_at)}</div><div>—</div></td>
                <td className="px-3 py-4"><p className={`text-xs font-black ${nextAction(b)==="Ready" ? "text-emerald-300" : "text-white/75"}`}>{nextAction(b)}</p><Link onClick={(e)=>e.stopPropagation()} href={`/admin/dashboard/crm/${b.id}`} className="mt-2 inline-flex min-w-[118px] whitespace-nowrap rounded-lg border border-white/10 px-3 py-1.5 text-xs font-black text-white/70 hover:border-rose-300/40 hover:text-white">Set Next Action</Link><MoreVertical className="mt-2 h-4 w-4 text-white/45" /></td>
              </tr>;
            })}
          </tbody>
        </table>
        <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 text-sm text-white/60 lg:flex-row lg:items-center lg:justify-between"><p>Showing <b className="text-white">{formatAdminNumber(pageStart)}</b> to <b className="text-white">{formatAdminNumber(pageEnd)}</b> of <b className="text-white">{formatAdminNumber(total)}</b> locations</p>{pagination}</div>
      </AdminDataTableShell>
      {panelOpen && selected ? <AdminDetailPanel><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-xl font-black text-white">{selected.name}</h2><p className="mt-1 text-sm leading-5 text-white/50">{address(selected)}</p></div><button type="button" aria-label="Close detail panel" onClick={()=>setPanelOpen(false)} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></div><AdminStatusBadge tone="rose">{status(selected)}</AdminStatusBadge><div className="mt-4 flex gap-2 border-b border-white/10 pb-3 text-xs font-black"><span className="border-b-2 border-[#ec0b5b] px-2 py-1 text-white">Overview</span><span className="px-2 py-1 text-white/40">Notes (0)</span><span className="px-2 py-1 text-white/40">Tasks (0)</span><span className="px-2 py-1 text-white/40">Activity</span></div><div className="mt-4 space-y-4 text-sm"><Detail title="Profile" rows={[["Market", marketName(selected)],["Type", selected.location_type || selected.category],["Searchable", selected.is_searchable ? "Yes":"No"],["Photos", selected.image_url || selected.main_image ? "Yes":"No"],["Google ID", selected.google_place_id ? "Yes":"—"]]} href={`/admin/dashboard/crm/${selected.id}?tab=profile`} /><Detail title="Portal / Embed" rows={[["Portal", selected.reservation_portal_status || "Not enabled"],["Embed", selected.embed_status || "Not sent"]]} href={`/admin/dashboard/crm/${selected.id}?tab=qr`} /><Detail title="Discovery" rows={[["Stage", selected.discovery_status || "Free Discovery"],["Status", selected.partner_sales_status || "Needs review"],["Next Action", nextAction(selected)]]} href={`/admin/dashboard/crm/${selected.id}`} /><Detail title="Reservation" rows={[["Portal Status", selected.reservation_portal_status || "Not enabled"],["Reservation URL", selected.reservation_url],["External URL", selected.external_reservation_url],["Ready Score", selected.reservation_readiness_score ? `${selected.reservation_readiness_score}%` : "—"],["Completions 30d", selected.reservation_completions_30d || 0]]} href={`/admin/dashboard/crm/${selected.id}?tab=reservations`} /><AdminActionButton href={`/admin/dashboard/crm/${selected.id}?tab=reservations`} variant="primary">Manage Reservations</AdminActionButton><AdminDetailSection title="Contact Notes" action={<Link className="text-xs font-black text-rose-200" href={`/admin/dashboard/crm/${selected.id}?tab=notes`}>+ Add Note</Link>}><AdminEmptyState title="No notes yet" body="Add a note to keep track of important details." /></AdminDetailSection><div className="grid gap-2 sm:grid-cols-2">{canViewPublic && publicHref ? <AdminActionButton href={publicHref}>View Public Page</AdminActionButton> : <div><button type="button" disabled className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white/35 disabled:cursor-not-allowed">{publicHref ? "Public Page Not Live" : "Public Page Unavailable"}</button><p className="mt-1 text-xs text-white/40">{publicHref ? "This location is hidden from public search or missing public route data." : "Missing public location id or location is not public."}</p></div>}<AdminActionButton href="/admin/dashboard/my-workspace/tasks" variant="primary">Create Task</AdminActionButton></div></div></AdminDetailPanel> : null}
    </div>
  );
}

function Detail({ title, rows, href }: { title: string; rows: Array<[string, any]>; href: string }) {
  return <AdminDetailSection title={title} action={<Link href={href} className="text-xs font-black text-rose-200">Edit</Link>}><dl className="grid gap-2">{rows.map(([l, v])=><div key={l} className="flex justify-between gap-3 text-xs"><dt className="text-white/40">{l}</dt><dd className="max-w-[190px] truncate text-right font-bold capitalize text-white/70">{text(v)}</dd></div>)}</dl></AdminDetailSection>;
}
