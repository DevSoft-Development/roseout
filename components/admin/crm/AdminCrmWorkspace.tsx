"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  AdminActionButton,
  AdminDataTableShell,
  AdminDetailPanel,
  AdminDetailSection,
  AdminEmptyState,
  AdminReadinessIndicator,
  AdminStatusBadge,
  formatAdminDate,
  formatAdminNumber,
} from "@/components/admin/AdminDesignSystem";
import { canOpenPublicLocationPage, getCrmPublicLocationHref } from "@/lib/location-url";

type Row = any;

function text(value: any) {
  return value == null || value === "" ? "—" : String(value).replace(/_/g, " ");
}

function marketName(row: Row) {
  return text(row.market || row.location_market || row.borough || row.city || "Unknown");
}

function readiness(row: Row) {
  const values = [row.sales_readiness_score, row.reservation_portal_readiness_score, row.readiness_score]
    .map(Number)
    .filter((value) => Number.isFinite(value));
  if (values.length) return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
  let score = 70;
  if (row.is_searchable) score += 10;
  if (row.google_place_id) score += 8;
  if (row.image_url || row.main_image) score += 5;
  if (row.claim_outreach_status === "approved") score += 7;
  return Math.min(100, score);
}

function relationshipStatus(row: Row) {
  if (row.claim_outreach_status === "approved") return "Claimed";
  if (row.partner_sales_status) return text(row.partner_sales_status);
  if (row.crm_status) return text(row.crm_status);
  return row.is_searchable ? "Active" : "Needs attention";
}

function nextAction(row: Row) {
  return text(row.next_action || row.next_action_label || (row.is_searchable ? "Follow up" : "Review location"));
}

function address(row: Row) {
  return text(row.address || [row.city || row.borough, row.state, row.zip || row.zip_code].filter(Boolean).join(", "));
}

export default function AdminCrmWorkspace({
  businesses,
  empty,
  pageStart,
  pageEnd,
  total,
  pagination,
}: {
  businesses: Row[];
  empty: React.ReactNode;
  pageStart: number;
  pageEnd: number;
  total: number;
  pagination: React.ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(businesses[0]?.id || null);
  const [panelOpen, setPanelOpen] = useState(true);
  const selected = useMemo(
    () => businesses.find((business) => business.id === selectedId) || businesses[0],
    [businesses, selectedId],
  );
  const publicHref = selected ? getCrmPublicLocationHref(selected) : null;
  const canViewPublic = Boolean(publicHref && selected && canOpenPublicLocationPage(selected));

  if (!businesses.length) return <AdminDataTableShell>{empty}</AdminDataTableShell>;

  return (
    <div className={`grid min-w-0 gap-5 ${panelOpen ? "2xl:grid-cols-[minmax(0,1fr)_360px]" : "2xl:grid-cols-1"}`}>
      <AdminDataTableShell>
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.16em] text-white/45">
            <tr>
              {[
                "Location",
                "Relationship",
                "Readiness",
                "Last activity",
                "Next action",
              ].map((heading) => (
                <th key={heading} className="whitespace-nowrap px-4 py-3 font-black">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {businesses.map((business) => {
              const active = business.id === selected?.id;
              return (
                <tr
                  key={business.id}
                  tabIndex={0}
                  onClick={() => {
                    setSelectedId(business.id);
                    setPanelOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(business.id);
                      setPanelOpen(true);
                    }
                  }}
                  className={`cursor-pointer border-t border-white/10 align-top outline-none transition hover:bg-white/[0.035] focus:bg-white/[0.05] ${active ? "bg-rose-500/[0.04] ring-1 ring-inset ring-[#ec0b5b]/70" : ""}`}
                >
                  <td className="max-w-[320px] px-4 py-4">
                    <Link
                      onClick={(event) => event.stopPropagation()}
                      href={`/admin/dashboard/crm/${business.id}`}
                      className="font-black text-white hover:text-rose-100"
                    >
                      {business.name}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/50">{address(business)}</p>
                    <p className="mt-1 text-xs text-white/35">{marketName(business)}</p>
                  </td>
                  <td className="px-4 py-4">
                    <AdminStatusBadge tone={business.claim_outreach_status === "approved" || business.is_searchable ? "green" : "rose"}>
                      {relationshipStatus(business)}
                    </AdminStatusBadge>
                    <p className="mt-2 text-xs text-white/45">{business.is_searchable ? "Visible to customers" : "Needs review"}</p>
                  </td>
                  <td className="px-4 py-4"><AdminReadinessIndicator score={readiness(business)} /></td>
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-white/60">
                    {formatAdminDate(business.last_contacted_at || business.updated_at || business.created_at)}
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-xs font-black text-white/75">{nextAction(business)}</p>
                    <Link
                      onClick={(event) => event.stopPropagation()}
                      href={`/admin/dashboard/crm/${business.id}`}
                      className="mt-2 inline-flex rounded-lg border border-white/10 px-3 py-1.5 text-xs font-black text-white/70 hover:border-rose-300/40 hover:text-white"
                    >
                      Open record
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 text-sm text-white/60 lg:flex-row lg:items-center lg:justify-between">
          <p>Showing <b className="text-white">{formatAdminNumber(pageStart)}</b> to <b className="text-white">{formatAdminNumber(pageEnd)}</b> of <b className="text-white">{formatAdminNumber(total)}</b> locations</p>
          {pagination}
        </div>
      </AdminDataTableShell>

      {panelOpen && selected ? (
        <AdminDetailPanel>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-black text-white">{selected.name}</h2>
              <p className="mt-1 text-sm leading-5 text-white/50">{address(selected)}</p>
            </div>
            <button type="button" aria-label="Close detail panel" onClick={() => setPanelOpen(false)} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <AdminStatusBadge tone={selected.claim_outreach_status === "approved" || selected.is_searchable ? "green" : "rose"}>{relationshipStatus(selected)}</AdminStatusBadge>
            <AdminStatusBadge>{marketName(selected)}</AdminStatusBadge>
          </div>

          <div className="mt-5 space-y-4 text-sm">
            <AdminDetailSection title="Next action">
              <p className="font-black text-white">{nextAction(selected)}</p>
            </AdminDetailSection>

            <Detail
              title="Location"
              rows={[
                ["Type", selected.location_type || selected.category || selected.primary_category || "Location"],
                ["Public status", selected.is_searchable ? "Visible" : "Needs review"],
                ["Profile readiness", `${readiness(selected)}%`],
              ]}
              href={`/admin/dashboard/crm/${selected.id}?tab=profile`}
            />

            <Detail
              title="Reservations"
              rows={[
                ["Status", selected.reservation_portal_status || "Not set up"],
                ["Recent bookings", selected.reservation_completions_30d || 0],
              ]}
              href={`/admin/dashboard/crm/${selected.id}?tab=reservations`}
            />

            <AdminDetailSection title="Recent performance">
              <dl className="grid grid-cols-3 gap-2 text-center">
                <Metric label="Views" value={selected.profile_views_30d || 0} />
                <Metric label="Searches" value={selected.search_appearances_30d || 0} />
                <Metric label="Bookings" value={selected.reservation_completions_30d || 0} />
              </dl>
            </AdminDetailSection>

            <div className="grid gap-2 sm:grid-cols-2">
              <AdminActionButton href={`/admin/dashboard/crm/${selected.id}`} variant="primary">Open Record</AdminActionButton>
              <AdminActionButton href={`/admin/dashboard/crm/outreach?location_id=${selected.id}`}>Communications</AdminActionButton>
              <AdminActionButton href={`/admin/dashboard/crm/${selected.id}?tab=reservations`}>Reservations</AdminActionButton>
              <AdminActionButton href="/admin/dashboard/crm/work-queue?view=tasks">Create Task</AdminActionButton>
              {canViewPublic && publicHref ? <AdminActionButton href={publicHref}>View Public Page</AdminActionButton> : null}
            </div>

            {!canViewPublic ? <AdminEmptyState title="Public page unavailable" body="The location is not currently available on the public site." /> : null}
          </div>
        </AdminDetailPanel>
      ) : null}
    </div>
  );
}

function Detail({ title, rows, href }: { title: string; rows: Array<[string, any]>; href: string }) {
  return (
    <AdminDetailSection title={title} action={<Link href={href} className="text-xs font-black text-rose-200">View</Link>}>
      <dl className="grid gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 text-xs">
            <dt className="text-white/40">{label}</dt>
            <dd className="max-w-[190px] truncate text-right font-bold capitalize text-white/70">{text(value)}</dd>
          </div>
        ))}
      </dl>
    </AdminDetailSection>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/[0.04] p-3">
      <dd className="text-lg font-black text-white">{formatAdminNumber(value)}</dd>
      <dt className="mt-1 text-[11px] text-white/40">{label}</dt>
    </div>
  );
}
