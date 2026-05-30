import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/admin-auth";
import { getBusinessCRM, getLocationCrmRelatedData, getUpgradeFlags, type BusinessCRMRow } from "@/lib/admin-crm";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logAdminEvent } from "@/lib/admin/logAdminEvent";

export const dynamic = "force-dynamic";

const tabs = [
  "overview",
  "profile",
  "photos",
  "reservations",
  "claims",
  "owner",
  "plan",
  "analytics",
  "qr",
  "emails",
  "support",
  "logs",
  "seo",
  "settings",
] as const;

type Tab = (typeof tabs)[number];

function fmt(n: number) {
  return Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n || 0);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function badge(value?: string | null, tone = "default") {
  const cls = tone === "danger" ? "border-rose-300/30 bg-rose-500/10 text-rose-100" : tone === "good" ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.06] text-white/75";
  return <span className={`rounded-full border px-3 py-1 text-xs font-black ${cls}`}>{value || "Not set"}</span>;
}

async function saveLocationProfile(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["superadmin", "admin", "editor"]);
  const locationId = String(formData.get("location_id") || "");
  if (!locationId) return;

  const updates = {
    name: String(formData.get("name") || "").trim() || null,
    address: String(formData.get("address") || "").trim() || null,
    city: String(formData.get("city") || "").trim() || null,
    borough: String(formData.get("borough") || "").trim() || null,
    state: String(formData.get("state") || "").trim() || null,
    zip_code: String(formData.get("zip_code") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim() || null,
    website: String(formData.get("website") || "").trim() || null,
    category: String(formData.get("category") || "").trim() || null,
    cuisine: String(formData.get("cuisine") || "").trim() || null,
    description: String(formData.get("description") || "").trim() || null,
    reservation_url: String(formData.get("reservation_url") || "").trim() || null,
    external_reservation_url: String(formData.get("external_reservation_url") || "").trim() || null,
    status: String(formData.get("status") || "").trim() || null,
    is_searchable: formData.get("is_searchable") === "on",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from("locations").update(updates).eq("id", locationId);
  await logAdminEvent({
    level: error ? "error" : "info",
    category: "crm",
    action: "location_profile_updated",
    message: error ? `CRM profile update failed for ${locationId}` : `CRM profile updated for ${updates.name || locationId}`,
    actor_user_id: admin.user_id,
    actor_email: admin.email,
    entity_type: "location",
    entity_id: locationId,
    metadata: error ? { error: error.message } : { fields: Object.keys(updates) },
  });

  revalidatePath(`/admin/dashboard/crm/${locationId}`);
  redirect(`/admin/dashboard/crm/${locationId}?tab=profile`);
}

function StatCard({ label, value, helper }: { label: string; value: string | number; helper?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">{label}</p><p className="mt-2 text-3xl font-black">{value}</p>{helper ? <p className="mt-1 text-xs text-white/45">{helper}</p> : null}</div>;
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-5"><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-white/55">{text}</p></div>;
}

function ProfileForm({ business, canEdit }: { business: BusinessCRMRow; canEdit: boolean }) {
  const fields: Array<[string, string, string | null | undefined]> = [
    ["name", "Name", business.name],
    ["address", "Address", business.address],
    ["city", "City", business.city],
    ["borough", "Borough", business.borough],
    ["state", "State", business.state],
    ["zip_code", "Zip code", business.zip_code || business.zip],
    ["phone", "Phone", business.phone],
    ["website", "Website", business.website],
    ["category", "Category", business.category],
    ["cuisine", "Cuisine", business.cuisine],
    ["reservation_url", "Reservation URL", business.reservation_url],
    ["external_reservation_url", "External reservation URL", business.external_reservation_url],
    ["status", "Status", business.status],
  ];

  return <form action={saveLocationProfile} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
    <input type="hidden" name="location_id" value={business.id} />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {fields.map(([name, label, value]) => <label key={name} className="space-y-2 text-sm font-bold text-white/65"><span>{label}</span><input name={name} defaultValue={String(value || "")} disabled={!canEdit} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none disabled:opacity-60" /></label>)}
      <label className="space-y-2 text-sm font-bold text-white/65 xl:col-span-3"><span>Description</span><textarea name="description" defaultValue={business.description || ""} disabled={!canEdit} rows={5} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none disabled:opacity-60" /></label>
      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white/70"><input type="checkbox" name="is_searchable" defaultChecked={Boolean(business.is_searchable)} disabled={!canEdit} /> Searchable</label>
    </div>
    <div className="mt-5 flex flex-wrap gap-3">
      <button disabled={!canEdit} className="rounded-full bg-rose-600 px-6 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">Save profile</button>
      {!canEdit ? <p className="text-sm text-white/45">Viewer role is read-only.</p> : null}
    </div>
  </form>;
}

export default async function CRMDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const admin = await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);
  const { id } = await params;
  const query = await searchParams;
  const activeTab = tabs.includes(query.tab as Tab) ? (query.tab as Tab) : "overview";
  const business = await getBusinessCRM(id);
  if (!business) notFound();
  const related = await getLocationCrmRelatedData(business.id);
  const flags = getUpgradeFlags(business);
  const canEdit = ["superadmin", "admin", "editor"].includes(admin.role);
  const publicHref = business.location_type === "activities" ? `/activities/${business.id}` : `/restaurants/${business.id}`;
  const qualityScore = business.profile_quality_score || Math.round([business.name, business.address, business.city, business.phone, business.website, business.description].filter(Boolean).length / 6 * 100);
  const seoScore = business.seo_score || Math.round([business.name, business.description, business.category, business.city, business.is_searchable].filter(Boolean).length / 5 * 100);

  return <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1500px] space-y-6">
      <section className="sticky top-0 z-20 rounded-3xl border border-white/10 bg-[linear-gradient(135deg,#170b0b,#090706_60%,#14100c)] p-5 shadow-2xl shadow-black/30">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link href="/admin/dashboard/crm" className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">← TheOutHaven CRM</Link>
            <h1 className="mt-3 text-4xl font-black tracking-tight">{business.name}</h1>
            <p className="mt-2 text-sm text-white/60">{[business.address, business.city || business.borough, business.state, business.zip_code || business.zip].filter(Boolean).join(", ") || "Address unavailable"}</p>
            <div className="mt-4 flex flex-wrap gap-2">{badge(business.status || "active")}{badge(business.is_searchable ? "Searchable" : "Not searchable", business.is_searchable ? "good" : "danger")}{badge(business.is_claimed ? "Claimed" : "Unclaimed", business.is_claimed ? "good" : "danger")}{badge(business.plan_status || "Free Discovery")}{badge(business.crm_status)}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/dashboard/crm/${business.id}?tab=profile`} className="rounded-full bg-rose-600 px-4 py-2 text-sm font-black text-white">Edit profile</Link>
            <Link href={publicHref} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/70">View public page</Link>
            <Link href={`/admin/dashboard/crm/${business.id}?tab=claims`} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/70">Open claims</Link>
            <Link href={`/admin/dashboard/crm/${business.id}?tab=qr`} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/70">Print QR</Link>
            <Link href={`/admin/dashboard/crm/${business.id}?tab=support`} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/70">Add support note</Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Opportunity" value={fmt(business.opportunity_score)} />
          <StatCard label="Churn risk" value={fmt(business.churn_risk_score)} />
          <StatCard label="Profile quality" value={`${qualityScore}%`} />
          <StatCard label="SEO score" value={`${seoScore}%`} />
          <StatCard label="Reservation ready" value={`${business.reservation_readiness_score || (business.reservation_url ? 80 : 35)}%`} />
          <StatCard label="Open tasks" value={related.reminders.length || business.open_tasks || 0} />
        </div>
      </section>

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-sm font-bold">
        {tabs.map((tab) => <Link key={tab} href={`/admin/dashboard/crm/${business.id}?tab=${tab}`} className={`whitespace-nowrap rounded-full px-4 py-2 capitalize ${activeTab === tab ? "bg-rose-600 text-white" : "bg-black/20 text-white/60 hover:text-white"}`}>{tab === "qr" ? "QR Codes" : tab}</Link>)}
      </nav>

      {activeTab === "overview" ? <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Location command center</h2><p className="mt-2 text-sm leading-6 text-white/60">Owner, claim, plan, analytics, support, logs, and data quality context are consolidated here so admins do not need to jump across disconnected pages.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><StatCard label="Profile views 30d" value={fmt(business.profile_views_30d)} /><StatCard label="Search appearances 30d" value={fmt(business.search_appearances_30d)} /><StatCard label="Reserve intent 30d" value={fmt(business.reservation_completions_30d)} /><StatCard label="Conversion rate" value={`${fmt(business.conversion_rate_30d * 100)}%`} /></div></article>
        <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Next recommended action</h2><ul className="mt-4 space-y-2 text-sm text-white/70">{(flags.length ? flags : ["Monitor weekly", "Keep profile fresh", "Review search visibility"]).map((flag) => <li key={flag} className="rounded-2xl border border-white/10 bg-black/20 p-3">{flag}</li>)}</ul></article>
        <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Recent activity</h2>{related.logs.length ? <ul className="mt-3 space-y-2 text-sm text-white/70">{related.logs.slice(0, 6).map((log: any) => <li key={log.id} className="rounded-2xl border border-white/10 bg-black/20 p-3"><b>{log.action || log.category}</b> · {log.message}<span className="block text-xs text-white/40">{formatDate(log.created_at)}</span></li>)}</ul> : <EmptyPanel title="No activity yet" text="CRM actions, profile edits, claim changes, QR activity, and support notes will appear here after admins perform them." />}</article>
        <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Open tasks & support</h2>{related.reminders.length || related.supportTickets.length ? <ul className="mt-3 space-y-2 text-sm text-white/70">{[...related.reminders, ...related.supportTickets].slice(0, 6).map((item: any) => <li key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">{item.title || item.subject || item.message || "CRM item"}<span className="block text-xs text-white/40">{item.reminder_status || item.status || "open"}</span></li>)}</ul> : <EmptyPanel title="No open tasks" text="Tasks, reminders, and support tickets tied to this location will appear here." />}</article>
      </section> : null}

      {activeTab === "profile" ? <ProfileForm business={business} canEdit={canEdit} /> : null}
      {activeTab === "analytics" ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><StatCard label="Profile views" value={fmt(business.profile_views_30d)} /><StatCard label="Search appearances" value={fmt(business.search_appearances_30d)} /><StatCard label="Saves" value={fmt(business.saves_30d)} /><StatCard label="Reserve completions" value={fmt(business.reservation_completions_30d)} /><StatCard label="Call clicks" value={fmt(business.call_clicks_30d || 0)} /><StatCard label="Website clicks" value={fmt(business.website_clicks_30d || 0)} /><StatCard label="QR scans" value={fmt(business.qr_scans_30d || 0)} /><StatCard label="Conversion rate" value={`${fmt(business.conversion_rate_30d * 100)}%`} /><div className="xl:col-span-4"><EmptyPanel title="Location analytics only" text="This tab contains location-specific analytics. Platform-wide executive analytics stay on /admin/dashboard/analytics." /></div></section> : null}
      {activeTab === "claims" ? <section className="space-y-4"><Panel title="Claims" items={related.claims} empty="Pending, approved, rejected, and historical claims tied to this location will appear here." href="/admin/dashboard/claims" hrefLabel="Open platform claims" /></section> : null}
      {activeTab === "logs" ? <section className="space-y-4"><Panel title="Location logs" items={related.logs} empty="Profile edits, admin actions, claim changes, QR events, email failures, reservation errors, and support actions will appear here." href="/admin/dashboard/logs" hrefLabel="Open platform logs" /></section> : null}
      {activeTab === "emails" ? <Panel title="Communication history" items={related.communications} empty="Claim emails, reservation emails, support emails, and failed communications tied to this owner/location will appear here." href="/admin/dashboard/email-templates" hrefLabel="Open email templates" /> : null}
      {activeTab === "support" ? <Panel title="Support" items={related.supportTickets} empty="Support tickets and owner/customer complaints tied to this location will appear here." href="/admin/dashboard/support" hrefLabel="Open support inbox" /> : null}
      {activeTab === "photos" ? <EmptyPanel title="Photos" text="Main image and gallery management belong here. The current database view does not expose a full photo workflow; connect existing image/gallery fields or upload endpoints to enable add, remove, order, and featured-photo actions." /> : null}
      {activeTab === "reservations" ? <EmptyPanel title="Reservations" text={`Reservation URL: ${business.reservation_url || business.external_reservation_url || "not set"}. Location-specific reserve clicks, call clicks, website clicks, completions, and opportunities appear here when tracked.`} /> : null}
      {activeTab === "owner" ? <EmptyPanel title="Owner account" text={`Owner: ${business.owner_email || business.owner_user_id || "not linked"}. Invite, setup status, transfer, and owner activity should connect to existing owner-account APIs when available.`} /> : null}
      {activeTab === "plan" ? <EmptyPanel title="Plan and billing" text={`Current plan status: ${business.plan_status || "Free Discovery"}. Upgrade score ${fmt(business.opportunity_score)} and churn risk ${fmt(business.churn_risk_score)} help prioritize Pro/Reserve outreach.`} /> : null}
      {activeTab === "qr" ? <EmptyPanel title="QR Codes" text="Claim QR code, status, print/download, regeneration, and scan history live here. Use the platform claim QR page for bulk operations." /> : null}
      {activeTab === "seo" ? <EmptyPanel title="SEO and searchability" text={`SEO score ${seoScore}%. Searchable: ${business.is_searchable ? "yes" : "no"}. Missing meta fields, slug checks, and global SEO tools should link here for location-specific work.`} /> : null}
      {activeTab === "settings" ? <section className="grid gap-4 lg:grid-cols-2"><EmptyPanel title="Location settings" text="Active/inactive state, searchable toggle, CRM priority, follow-up date, outreach status, internal notes, and safe admin controls live here." /><EmptyPanel title="Danger zone" text="No destructive controls are enabled in this step. Keep public/search-facing data safe and use additive CRM data only." /></section> : null}
    </div>
  </main>;
}

function Panel({ title, items, empty, href, hrefLabel }: { title: string; items: any[]; empty: string; href: string; hrefLabel: string }) {
  return <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center justify-between gap-4"><h2 className="text-xl font-black">{title}</h2><Link href={href} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/70">{hrefLabel}</Link></div>{items.length ? <ul className="mt-4 space-y-2 text-sm text-white/70">{items.map((item) => <li key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-3"><b>{item.title || item.subject || item.action || item.status || item.category || "Record"}</b><p className="mt-1 text-white/55">{item.message || item.note_body || item.description || item.owner_email || item.delivery_status || "Real record"}</p><span className="mt-1 block text-xs text-white/35">{formatDate(item.created_at || item.submitted_at || item.sent_at)}</span></li>)}</ul> : <div className="mt-4"><EmptyPanel title={`No ${title.toLowerCase()} yet`} text={empty} /></div>}</article>;
}
