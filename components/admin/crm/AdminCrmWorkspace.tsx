"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  AdminActionButton,
  AdminDataTableShell,
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

function contactName(row: Row) {
  return text(row.owner_name || row.contact_name || row.primary_contact_name || "No primary contact");
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!businesses.length) return <AdminDataTableShell>{empty}</AdminDataTableShell>;

  return (
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
            const expanded = business.id === expandedId;
            return (
              <Fragment key={business.id}>
                <tr
                  tabIndex={0}
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : business.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setExpandedId(expanded ? null : business.id);
                    }
                  }}
                  className={`cursor-pointer border-t border-white/10 align-top outline-none transition hover:bg-white/[0.035] focus:bg-white/[0.05] ${expanded ? "bg-rose-500/[0.05]" : ""}`}
                >
                  <td className="max-w-[320px] px-4 py-4">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        aria-label={expanded ? `Collapse ${business.name}` : `Expand ${business.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedId(expanded ? null : business.id);
                        }}
                        className="mt-0.5 rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-white/55 hover:text-white"
                      >
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <div className="min-w-0">
                        <p className="font-black text-white">{business.name}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/50">{address(business)}</p>
                        <p className="mt-1 text-xs text-white/35">{marketName(business)}</p>
                      </div>
                    </div>
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
                    <span className="mt-2 inline-flex text-xs font-black text-rose-200">
                      {expanded ? "Hide overview" : "View overview"}
                    </span>
                  </td>
                </tr>

                {expanded ? <ExpandedLocationOverview business={business} /> : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 text-sm text-white/60 lg:flex-row lg:items-center lg:justify-between">
        <p>Showing <b className="text-white">{formatAdminNumber(pageStart)}</b> to <b className="text-white">{formatAdminNumber(pageEnd)}</b> of <b className="text-white">{formatAdminNumber(total)}</b> locations</p>
        {pagination}
      </div>
    </AdminDataTableShell>
  );
}

function ExpandedLocationOverview({ business }: { business: Row }) {
  const publicHref = getCrmPublicLocationHref(business);
  const canViewPublic = Boolean(publicHref && canOpenPublicLocationPage(business));

  return (
    <tr className="border-t border-[#ec0b5b]/30 bg-[#0b0b0e]">
      <td colSpan={5} className="p-0">
        <section className="border-y border-white/[0.06] px-5 py-5 lg:px-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-rose-300">Location overview</p>
              <h3 className="mt-1 text-xl font-black text-white">{business.name}</h3>
              <p className="mt-1 text-sm text-white/50">{address(business)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <AdminStatusBadge tone={business.claim_outreach_status === "approved" || business.is_searchable ? "green" : "rose"}>{relationshipStatus(business)}</AdminStatusBadge>
                <AdminStatusBadge>{marketName(business)}</AdminStatusBadge>
                <AdminStatusBadge>{business.location_type || business.category || business.primary_category || "Location"}</AdminStatusBadge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <AdminActionButton href={`/admin/dashboard/crm/${business.id}`} variant="primary">Open Full Record</AdminActionButton>
              <AdminActionButton href={`/admin/dashboard/crm/outreach?location_id=${business.id}`}>Communicate</AdminActionButton>
              <AdminActionButton href={`/admin/dashboard/crm/opportunities?location_id=${business.id}`}>Sales</AdminActionButton>
              <AdminActionButton href="/admin/dashboard/crm/work-queue?view=tasks">Create Task</AdminActionButton>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <AdminDetailSection title="Relationship">
                <dl className="grid gap-2 text-xs">
                  <OverviewRow label="Primary contact" value={contactName(business)} />
                  <OverviewRow label="Email" value={business.owner_email || business.email} />
                  <OverviewRow label="Phone" value={business.owner_phone || business.phone} />
                  <OverviewRow label="Claim status" value={relationshipStatus(business)} />
                  <OverviewRow label="Next action" value={nextAction(business)} />
                </dl>
              </AdminDetailSection>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <AdminDetailSection title="Business overview">
                <dl className="grid gap-2 text-xs">
                  <OverviewRow label="Profile readiness" value={`${readiness(business)}%`} />
                  <OverviewRow label="Public status" value={business.is_searchable ? "Visible" : "Needs review"} />
                  <OverviewRow label="Reservation status" value={business.reservation_portal_status || "Not set up"} />
                  <OverviewRow label="Plan" value={business.partner_plan || business.plan_name || business.subscription_plan || "—"} />
                  <OverviewRow label="Last activity" value={formatAdminDate(business.last_contacted_at || business.updated_at || business.created_at)} />
                </dl>
              </AdminDetailSection>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <AdminDetailSection title="Recent performance">
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <Metric label="Views" value={business.profile_views_30d || 0} />
                  <Metric label="Searches" value={business.search_appearances_30d || 0} />
                  <Metric label="Bookings" value={business.reservation_completions_30d || 0} />
                </dl>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <AdminActionButton href={`/admin/dashboard/crm/${business.id}?tab=reservations`}>Reservations</AdminActionButton>
                  {canViewPublic && publicHref ? <AdminActionButton href={publicHref}>View Public Page</AdminActionButton> : null}
                </div>
                {!canViewPublic ? <div className="mt-3"><AdminEmptyState title="Public page unavailable" body="This location is not currently available on the public site." /></div> : null}
              </AdminDetailSection>
            </div>
          </div>
        </section>
      </td>
    </tr>
  );
}

function OverviewRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.05] pb-2 last:border-0 last:pb-0">
      <dt className="text-white/40">{label}</dt>
      <dd className="max-w-[65%] text-right font-bold capitalize text-white/75">{text(value)}</dd>
    </div>
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
