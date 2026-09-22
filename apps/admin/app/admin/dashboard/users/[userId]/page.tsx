import {
  AdminActionButton,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
  formatAdminDate,
} from "@/components/admin/AdminDesignSystem";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminUserDetail } from "@/lib/admin/admin-user-detail";
import { AccountAccessForm, DeleteUser, PasswordReset, ProfileForm } from "../UserActions";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  await requireAdminRole(["superadmin"]);
  const { userId } = await params;
  const detail = await getAdminUserDetail(userId);
  const profile = detail.profile;
  const openTickets = detail.tickets.filter((ticket: any) => !["closed", "resolved"].includes(ticket.status)).length;

  return <AdminPageShell>
    <AdminPageHeader
      eyebrow="User Management"
      title={profile.first_name || profile.email || "Customer"}
      subtitle={profile.email}
      badge={<div className="flex gap-2">
        <AdminStatusBadge>{profile.role}</AdminStatusBadge>
        <AdminStatusBadge tone="rose">{profile.plan}</AdminStatusBadge>
        {detail.beta ? <AdminStatusBadge tone="green">Beta User</AdminStatusBadge> : null}
        <AdminStatusBadge tone={profile.email_confirmed_at ? "green" : "amber"}>{profile.email_confirmed_at ? "Email Confirmed" : "Unconfirmed"}</AdminStatusBadge>
        <AdminStatusBadge>{profile.account_status}</AdminStatusBadge>
      </div>}
      actions={<>
        {profile.hasAccount && profile.email ? <PasswordReset userId={userId} /> : null}
        <AdminActionButton href="/admin/dashboard/users">All Users</AdminActionButton>
      </>}
    />

    <AdminKpiGrid>
      <AdminKpiCard label="Weekly Search Usage" value={detail.usage.filter((row: any) => row.allowed).length} />
      <AdminKpiCard label="Saved Outings" value={detail.saved.length} />
      <AdminKpiCard label="Booked Outings" value={detail.booked.length + detail.reservations.length} />
      <AdminKpiCard label="Open Tickets" value={openTickets} />
      <AdminKpiCard label="Created" value={formatAdminDate(profile.created_at)} />
      <AdminKpiCard label="Beta" value={detail.beta?.status || "No"} />
    </AdminKpiGrid>

    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Consumer overview"><Info rows={[
        ["First name", profile.first_name],
        ["Email", profile.email],
        ["Mobile", profile.phone_e164 || profile.phone],
        ["Birth month", profile.birth_month],
        ["ZIP", profile.home_zip_code],
        ["Plan", profile.plan],
      ]} /></Card>
      {profile.hasAccount ? <Card title="Consumer Profile"><ProfileForm userId={userId} profile={profile} /></Card> : <Card title="Consumer Profile"><p className="text-sm text-white/55">This beta tester does not have an account profile yet, so profile editing is unavailable until an account is created.</p></Card>}
      {profile.hasAccount ? <Card title="Derived Home Geography"><Info rows={[
        ["Neighborhood", profile.home_neighborhood],
        ["Borough", profile.home_borough],
        ["City", profile.home_city],
        ["County", profile.home_county],
        ["State", profile.home_state],
        ["Market", profile.home_market],
        ["Geo source", profile.home_geo_source],
      ]} /></Card> : null}
      {profile.hasAccount ? <Card title="Account & Access"><AccountAccessForm userId={userId} profile={profile} /><div className="mt-4"><Info rows={[
        ["Email verified", profile.email_confirmed_at ? "Yes" : "No"],
        ["Account status", profile.account_status],
        ["Created", formatAdminDate(profile.created_at)],
      ]} /></div></Card> : null}
      <Rows title="Saved Outings" rows={detail.saved} fields={["title", "created_at", "restaurant_name", "activity_name"]} />
      <Rows title="Booked Outings / Reservations" rows={[...detail.booked, ...detail.reservations]} fields={["title", "status", "outing_date", "restaurant_name", "activity_name"]} />
      <Card title="Beta Activity"><Info rows={[["Status", detail.beta?.status || "Not beta"], ["Tester type", detail.beta?.tester_type], ["Weekly completed", detail.beta?.weekly_completed_tests], ["Approved", formatAdminDate(detail.beta?.approved_at)]]} /></Card>
      <Rows title="Support Tickets" rows={detail.tickets} fields={["ticket_number", "subject", "status", "priority"]} />
      <Rows title="Beta Task Assignments" rows={detail.betaAssignments || []} fields={["created_at", "status", "completed_at", "submitted_prompt"]} />
      <Rows title="Beta Feedback" rows={detail.betaFeedback || []} fields={["created_at", "feedback_type", "status", "message"]} />
      <Rows title="Beta Bug Reports" rows={detail.betaBugReports || []} fields={["created_at", "title", "severity", "status"]} />
      <Rows title="Account Activity / Search Usage" rows={detail.usage.slice(0, 20)} fields={["created_at", "query", "allowed", "plan_key", "limit_reason"]} />
      {profile.hasAccount ? <Card title="Danger Zone"><DeleteUser userId={userId} email={profile.email} /></Card> : null}
    </div>
  </AdminPageShell>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <AdminSectionCard className="p-5"><h2 className="text-xl font-black text-white">{title}</h2><div className="mt-4">{children}</div></AdminSectionCard>;
}

function Info({ rows }: { rows: any[][] }) {
  return <div className="grid gap-2">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4 rounded-2xl bg-white/[.035] p-3 text-sm"><span className="text-white/45">{label}</span><b className="text-white">{String(value || "—")}</b></div>)}</div>;
}

function Rows({ title, rows, fields }: { title: string; rows: any[]; fields: string[] }) {
  return <Card title={title}>{rows.length ? <div className="grid gap-2">{rows.map((row: any) => <div key={row.id} className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="grid gap-2 text-sm md:grid-cols-4">{fields.map(field => <span key={field}><b className="text-white/40">{field.replaceAll("_", " ")}: </b>{field.includes("at") || field.includes("date") ? formatAdminDate(row[field]) : String(row[field] ?? "—")}</span>)}</div></div>)}</div> : <p className="text-sm text-white/55">None yet.</p>}</Card>;
}
