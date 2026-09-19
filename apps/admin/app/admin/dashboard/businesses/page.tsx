export const dynamic = "force-dynamic";

import { BriefcaseBusiness, MessageSquareText, ShieldAlert } from "lucide-react";
import BusinessViewPage from "./view/page";
import {
  AdminFilterChip,
  AdminFilterGroup,
  AdminFilterPanel,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

const tabs = [
  ["Overview", "/admin/dashboard/businesses"],
  ["View Businesses", "/admin/dashboard/businesses/view"],
  ["Outreach", "/admin/dashboard/businesses/outreach"],
  ["Follow-ups", "/admin/dashboard/businesses/followups"],
  ["Communication Center", "/admin/dashboard/businesses/communication-center"],
  ["Upgrade Opportunities", "/admin/dashboard/businesses/upgrade-opportunities"],
  ["Churn Risk", "/admin/dashboard/businesses/churn-risk"],
] as const;

export default async function BusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; locationId?: string }>;
}) {
  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Revenue & CRM"
        title="Businesses"
        subtitle="Operate the full business lifecycle from one workspace: ownership, outreach, follow-ups, communications, upgrade opportunities, reservation readiness, and churn risk."
        badge={<AdminStatusBadge tone="rose">Business CRM</AdminStatusBadge>}
      />

      <AdminFilterPanel>
        <AdminFilterGroup label="Business operations">
          {tabs.map(([label, href], index) => (
            <AdminFilterChip key={href} href={href} active={index === 0}>
              {label}
            </AdminFilterChip>
          ))}
        </AdminFilterGroup>
      </AdminFilterPanel>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <BriefcaseBusiness className="h-4 w-4 text-rose-200" />
          <p className="mt-3 text-sm font-black text-white">Commercial workspace</p>
          <p className="mt-1 text-xs leading-5 text-white/45">Business account state, plan opportunities, owner access, and CRM workflow in one place.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <MessageSquareText className="h-4 w-4 text-rose-200" />
          <p className="mt-3 text-sm font-black text-white">Communication visibility</p>
          <p className="mt-1 text-xs leading-5 text-white/45">Outreach and communication history remain attached to the selected business record.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <ShieldAlert className="h-4 w-4 text-rose-200" />
          <p className="mt-3 text-sm font-black text-white">Risk and retention</p>
          <p className="mt-1 text-xs leading-5 text-white/45">Churn risk and upgrade signals stay visible beside operational account context.</p>
        </div>
      </section>

      <BusinessViewPage searchParams={searchParams} embedded />
    </AdminPageShell>
  );
}
