import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/admin-auth";
import { getBusinessCRM, getClaimStatus, getDisplayCRMStatus, getLocationCrmRelatedData, getUpgradeFlags, type BusinessCRMRow } from "@/lib/admin-crm";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logAdminEvent } from "@/lib/admin/logAdminEvent";
import CommunicationPanel from "./CommunicationPanel";
import { createClaimQr } from "@/lib/claimQrServer";

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
  "communication",
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

function formatLocationAddress(business: Partial<BusinessCRMRow>) {
  const address = String(business.address || "").trim();
  const city = String(business.city || business.borough || "").trim();
  const state = String(business.state || "").trim();
  const zip = String(business.zip_code || business.zip || "").trim();
  const lower = address.toLowerCase();
  const extras = [city, state, zip].filter((part) => part && !lower.includes(part.toLowerCase()));
  return [address, ...extras].filter(Boolean).join(", ") || "Address unavailable";
}

function normalizeImageList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : (item as any)?.url || (item as any)?.src || "").filter(Boolean);
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return normalizeImageList(parsed); } catch {}
    return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

async function safeUpdateLocation(locationId: string, updates: Record<string, any>) {
  const { error } = await supabaseAdmin.from("locations").update(updates).eq("id", locationId);
  if (!error) return null;
  const messages: string[] = [error.message];
  for (const [key, value] of Object.entries(updates)) {
    const single = await supabaseAdmin.from("locations").update({ [key]: value }).eq("id", locationId);
    if (single.error) messages.push(`${key}: ${single.error.message}`);
  }
  return messages.join("; ");
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


async function saveLocationPhotos(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["superadmin", "admin", "editor"]);
  const locationId = String(formData.get("location_id") || "");
  const mainImage = String(formData.get("main_image") || "").trim() || null;
  const gallery = String(formData.get("gallery_images") || "").split(/\n|,/).map((url) => url.trim()).filter(Boolean);
  const error = await safeUpdateLocation(locationId, { main_image: mainImage, image_url: mainImage, gallery_images: gallery, photos: gallery, updated_at: new Date().toISOString() });
  await supabaseAdmin.from("location_photo_change_logs").insert({ location_id: locationId, main_image: mainImage, gallery_count: gallery.length, actor_user_id: admin.user_id, actor_email: admin.email });
  await logAdminEvent({ level: error ? "error" : "info", category: "crm", action: "location_photos_updated", message: error ? `Photo update had partial failures for ${locationId}` : `Photos updated for ${locationId}`, actor_user_id: admin.user_id, actor_email: admin.email, entity_type: "location", entity_id: locationId, metadata: { gallery_count: gallery.length, error } });
  revalidatePath(`/admin/dashboard/crm/${locationId}`);
  redirect(`/admin/dashboard/crm/${locationId}?tab=photos`);
}

async function savePlanBilling(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["superadmin"]);
  const locationId = String(formData.get("location_id") || "");
  const plan = String(formData.get("plan") || "free_discovery");
  const status = String(formData.get("plan_status") || "inactive");
  const trialType = String(formData.get("trial_type") || "none");
  if (trialType === "forever_comped" && admin.role !== "superadmin") redirect("/admin/unauthorized");
  const trialDays = { "7_days": 7, "14_days": 14, "30_days": 30, "60_days": 60, "90_days": 90 }[trialType] as number | undefined;
  const trialEnds = trialDays ? new Date(Date.now() + trialDays * 86400000).toISOString() : null;
  const note = String(formData.get("billing_notes") || "").trim() || null;
  const error = await safeUpdateLocation(locationId, { plan, plan_status: status, subscription_plan: plan, subscription_status: status, trial_ends_at: trialEnds, promo_code: String(formData.get("promo_code") || "").trim() || null, promo_campaign: String(formData.get("promo_campaign") || "").trim() || null, billing_notes: note, is_pro: plan !== "free_discovery", updated_at: new Date().toISOString() });
  await supabaseAdmin.from("location_plan_change_logs").insert({ location_id: locationId, new_plan: plan, new_status: status, trial_ends_at: trialEnds, promo_code: String(formData.get("promo_code") || "") || null, promo_campaign: String(formData.get("promo_campaign") || "") || null, note, actor_user_id: admin.user_id, actor_email: admin.email });
  await supabaseAdmin.from("business_crm_notes").insert({ location_id: locationId, note: `Plan updated to ${plan} / ${status}${note ? ` — ${note}` : ""}`, note_type: "billing", created_by: admin.user_id });
  await logAdminEvent({ level: error ? "error" : "info", category: "crm", action: "location_plan_updated", message: `Plan updated for ${locationId}`, actor_user_id: admin.user_id, actor_email: admin.email, entity_type: "location", entity_id: locationId, metadata: { plan, status, error } });
  revalidatePath(`/admin/dashboard/crm/${locationId}`);
  redirect(`/admin/dashboard/crm/${locationId}?tab=plan`);
}

async function saveLocationSettings(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["superadmin", "admin", "editor"]);
  const locationId = String(formData.get("location_id") || "");
  const crmStatus = String(formData.get("crm_status") || "Needs Outreach");
  const updates = { active: formData.get("active") === "true", status: formData.get("active") === "true" ? "active" : "inactive", is_searchable: formData.get("is_searchable") === "true", crm_priority: String(formData.get("crm_priority") || "normal"), priority_level: String(formData.get("crm_priority") || "normal"), follow_up_date: String(formData.get("follow_up_date") || "") || null, outreach_status: String(formData.get("outreach_status") || "none"), crm_status: crmStatus, internal_notes: String(formData.get("internal_notes") || "").trim() || null, updated_at: new Date().toISOString() };
  const error = await safeUpdateLocation(locationId, updates);
  await supabaseAdmin.from("business_crm_notes").insert({ location_id: locationId, note: `Settings updated. CRM status: ${crmStatus}.`, note_type: "settings", created_by: admin.user_id });
  await logAdminEvent({ level: error ? "error" : "info", category: "crm", action: "location_settings_updated", message: `Settings updated for ${locationId}`, actor_user_id: admin.user_id, actor_email: admin.email, entity_type: "location", entity_id: locationId, metadata: { updates, error } });
  revalidatePath(`/admin/dashboard/crm/${locationId}`);
  redirect(`/admin/dashboard/crm/${locationId}?tab=settings`);
}

async function regenerateLocationClaimQr(formData: FormData) {
  "use server";
  const admin = await requireAdminRole(["superadmin", "admin"]);
  const locationId = String(formData.get("location_id") || "");
  const qr = await createClaimQr("location");
  const error = await safeUpdateLocation(locationId, { ...qr, updated_at: new Date().toISOString() });
  await supabaseAdmin.from("location_claim_codes").upsert({ location_id: locationId, claim_code: qr.claim_code, claim_url: qr.claim_url, qr_url: qr.claim_qr_url, status: "active", scan_count: 0, updated_at: new Date().toISOString() }, { onConflict: "location_id" });
  await logAdminEvent({ level: error ? "error" : "info", category: "crm", action: "location_claim_qr_regenerated", message: `Claim QR regenerated for ${locationId}`, actor_user_id: admin.user_id, actor_email: admin.email, entity_type: "location", entity_id: locationId, metadata: { claim_code: qr.claim_code, error } });
  revalidatePath(`/admin/dashboard/crm/${locationId}`);
  redirect(`/admin/dashboard/crm/${locationId}?tab=qr`);
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
    <p className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/60"><b className="text-white/80">Public address preview:</b> {formatLocationAddress(business)}</p>
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
  const requestedTab = query.tab === "emails" ? "communication" : query.tab;
  const activeTab = tabs.includes(requestedTab as Tab) ? (requestedTab as Tab) : "overview";
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
            <p className="mt-2 text-sm text-white/60">{formatLocationAddress(business)}</p>
            <div className="mt-4 flex flex-wrap gap-2">{badge(business.status || "active")}{badge(business.is_searchable ? "Searchable" : "Not searchable", business.is_searchable ? "good" : "danger")}{badge(getClaimStatus(business), business.is_claimed ? "good" : "danger")}{badge(business.plan_status || "Free Discovery")}{badge(getDisplayCRMStatus(business))}</div>
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
        {tabs.map((tab) => <Link key={tab} href={`/admin/dashboard/crm/${business.id}?tab=${tab}`} className={`whitespace-nowrap rounded-full px-4 py-2 capitalize ${activeTab === tab ? "bg-rose-600 text-white" : "bg-black/20 text-white/60 hover:text-white"}`}>{tab === "qr" ? "QR Codes" : tab === "communication" ? "Communication" : tab}</Link>)}
      </nav>

      {activeTab === "overview" ? <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Location command center</h2><p className="mt-2 text-sm leading-6 text-white/60">Owner, claim, plan, analytics, support, logs, and data quality context are consolidated here so admins do not need to jump across disconnected pages.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><StatCard label="Profile views 30d" value={fmt(business.profile_views_30d)} /><StatCard label="Search appearances 30d" value={fmt(business.search_appearances_30d)} /><StatCard label="Reserve intent 30d" value={fmt(business.reservation_completions_30d)} /><StatCard label="Conversion rate" value={`${fmt(business.conversion_rate_30d * 100)}%`} /></div></article>
        <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Next recommended action</h2><ul className="mt-4 space-y-2 text-sm text-white/70">{(flags.length ? flags : ["Monitor weekly", "Keep profile fresh", "Review search visibility"]).map((flag) => <li key={flag} className="rounded-2xl border border-white/10 bg-black/20 p-3">{flag}</li>)}</ul></article>
        <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Recent activity</h2>{related.logs.length ? <ul className="mt-3 space-y-2 text-sm text-white/70">{related.logs.slice(0, 6).map((log: any) => <li key={log.id} className="rounded-2xl border border-white/10 bg-black/20 p-3"><b>{log.action || log.category}</b> · {log.message}<span className="block text-xs text-white/40">{formatDate(log.created_at)}</span></li>)}</ul> : <EmptyPanel title="No activity yet" text="CRM actions, profile edits, claim changes, QR activity, and support notes will appear here after admins perform them." />}</article>
        <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Open tasks & support</h2>{related.reminders.length || related.supportTickets.length ? <ul className="mt-3 space-y-2 text-sm text-white/70">{[...related.reminders, ...related.supportTickets].slice(0, 6).map((item: any) => <li key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">{item.title || item.subject || item.message || "CRM item"}<span className="block text-xs text-white/40">{item.reminder_status || item.status || "open"}</span></li>)}</ul> : <EmptyPanel title="No open tasks" text="Tasks, reminders, and support tickets tied to this location will appear here." />}</article>
      </section> : null}

      {activeTab === "profile" ? <ProfileForm business={business} canEdit={canEdit} /> : null}
      {activeTab === "analytics" ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><StatCard label="Profile views" value={fmt(business.profile_views_30d)} /><StatCard label="Search appearances" value={fmt(business.search_appearances_30d)} /><StatCard label="Saves" value={fmt(business.saves_30d)} /><StatCard label="Reserve completions" value={fmt(business.reservation_completions_30d)} /><StatCard label="Call clicks" value={fmt(business.call_clicks_30d || 0)} /><StatCard label="Website clicks" value={fmt(business.website_clicks_30d || 0)} /><StatCard label="QR scans" value={fmt(business.qr_scans_30d || 0)} /><StatCard label="Conversion rate" value={`${fmt(business.conversion_rate_30d * 100)}%`} /><div className="xl:col-span-4"><EmptyPanel title="Location analytics only" text="This tab contains location-specific analytics. Platform-wide executive analytics stay on /admin/dashboard/analytics." /></div></section> : null}
      {activeTab === "claims" ? <ClaimsPanel business={business} claims={related.claims} /> : null}
      {activeTab === "logs" ? <section className="space-y-4"><Panel title="Location logs" items={related.logs} empty="No admin activity has been recorded for this location yet." href="/admin/dashboard/logs" hrefLabel="Open platform logs" /></section> : null}
      {activeTab === "communication" ? <CommunicationPanel locationId={business.id} defaultEmail={business.owner_email} defaultPhone={business.phone} templates={related.templates} logs={related.communications} canSend={canEdit} /> : null}
      {activeTab === "support" ? <Panel title="Support" items={related.supportTickets} empty="No support tickets have been opened for this location yet." href="/admin/dashboard/support" hrefLabel="Open support inbox" /> : null}
      {activeTab === "photos" ? <PhotosPanel business={business} canEdit={canEdit} /> : null}
      {activeTab === "reservations" ? <EmptyPanel title="Reservations" text={`Reservation URL: ${business.reservation_url || business.external_reservation_url || "not set"}. Review reserve clicks, call clicks, website clicks, and completions for this location here.`} /> : null}
      {activeTab === "owner" ? <OwnerPanel business={business} owners={related.owners} /> : null}
      {activeTab === "plan" ? <PlanBillingPanel business={business} canEdit={admin.role === "superadmin"} isSuperadmin={admin.role === "superadmin"} /> : null}
      {activeTab === "qr" ? <QRCodePanel business={business} qrCodes={related.qrCodes} canRegenerate={["superadmin", "admin"].includes(admin.role)} /> : null}
      {activeTab === "seo" ? <EmptyPanel title="SEO and searchability" text={`SEO score ${seoScore}%. Searchable: ${business.is_searchable ? "yes" : "no"}. Use the profile and settings tabs to improve location-level search visibility.`} /> : null}
      {activeTab === "settings" ? <LocationSettingsPanel business={business} canEdit={canEdit} /> : null}
    </div>
  </main>;
}

function inputClass() { return "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none disabled:opacity-60"; }
function selectClass() { return "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none disabled:opacity-60"; }

function PhotosPanel({ business, canEdit }: { business: BusinessCRMRow; canEdit: boolean }) {
  const mainImage = business.main_image || business.image_url || "";
  const gallery = [business.gallery, business.photos, business.image_gallery, business.gallery_images, business.images].flatMap(normalizeImageList).filter((url, index, all) => url && all.indexOf(url) === index && url !== mainImage);
  return <form action={saveLocationPhotos} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
    <input type="hidden" name="location_id" value={business.id} />
    <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black">Photos</h2><p className="mt-2 text-sm text-white/55">Manage URL-based main and gallery images for the public location profile.</p></div><button disabled={!canEdit} className="rounded-full bg-rose-600 px-5 py-2 text-sm font-black text-white disabled:opacity-50">Save photos</button></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[360px_1fr]">
      <div className="space-y-3"><div className="aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/30">{mainImage ? <img src={mainImage} alt="Current main image" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center p-5 text-center text-sm text-white/45">No main image has been added yet.</div>}</div><label className="space-y-2 text-sm font-bold text-white/65"><span>Main image URL</span><input name="main_image" defaultValue={mainImage} disabled={!canEdit} className={inputClass()} /></label></div>
      <div><label className="space-y-2 text-sm font-bold text-white/65"><span>Gallery image URLs, one per line</span><textarea name="gallery_images" defaultValue={gallery.join("\n")} disabled={!canEdit} rows={10} className={inputClass()} /></label>{gallery.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{gallery.map((url, index) => <div key={url} className="rounded-2xl border border-white/10 bg-black/20 p-2"><img src={url} alt="Gallery" className="aspect-video w-full rounded-xl object-cover" /><p className="mt-2 truncate text-xs text-white/50">{index + 1}. {url}</p><p className="text-xs text-white/35">Edit the URL list above to set featured, remove, or reorder.</p></div>)}</div> : <EmptyPanel title="No gallery photos" text="No gallery photos have been added yet. Add image URLs below to improve the public location profile." />}</div>
    </div>
  </form>;
}

function ClaimsPanel({ business, claims }: { business: BusinessCRMRow; claims: any[] }) {
  return <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-black">Claims</h2><Link href="/admin/dashboard/claims" className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/70">Open claims</Link></div><p className="mt-2 text-sm text-white/55">Claim status: {getClaimStatus(business)}</p>{claims.length ? <div className="mt-4 grid gap-3">{claims.map((claim) => <div key={claim.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70"><div className="flex flex-wrap gap-2">{badge(claim.status)}<span>{claim.submitted_business_name || business.name}</span></div><dl className="mt-3 grid gap-2 sm:grid-cols-2"><div><dt className="text-xs text-white/40">Claimant</dt><dd>{claim.claimant_name || "—"}</dd></div><div><dt className="text-xs text-white/40">Email</dt><dd>{claim.claimant_email || "—"}</dd></div><div><dt className="text-xs text-white/40">Phone</dt><dd>{claim.claimant_phone || "—"}</dd></div><div><dt className="text-xs text-white/40">Submitted</dt><dd>{formatDate(claim.submitted_at)}</dd></div><div><dt className="text-xs text-white/40">Reviewed</dt><dd>{formatDate(claim.reviewed_at)}</dd></div><div><dt className="text-xs text-white/40">Review notes</dt><dd>{claim.review_notes || "—"}</dd></div></dl></div>)}</div> : <EmptyPanel title="No claims submitted" text="No claims have been submitted for this location yet." />}</article>;
}

function PlanBillingPanel({ business, canEdit, isSuperadmin }: { business: BusinessCRMRow; canEdit: boolean; isSuperadmin: boolean }) {
  return <form action={savePlanBilling} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><input type="hidden" name="location_id" value={business.id} /><h2 className="text-xl font-black">Plan and billing</h2><p className="mt-2 text-sm text-white/55">Use this to upgrade a location manually, comp a partner account, start a trial, or track a promo-driven upgrade.</p><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><label className="space-y-2 text-sm font-bold text-white/65"><span>Plan</span><select name="plan" defaultValue={business.plan || "free_discovery"} disabled={!canEdit} className={selectClass()}>{["free_discovery","pro","reserve","pro_reserve","enterprise"].map((v)=><option key={v}>{v}</option>)}</select></label><label className="space-y-2 text-sm font-bold text-white/65"><span>Billing status</span><select name="plan_status" defaultValue={business.plan_status || "inactive"} disabled={!canEdit} className={selectClass()}>{["inactive","trialing","active","comped","past_due","canceled"].map((v)=><option key={v}>{v}</option>)}</select></label><label className="space-y-2 text-sm font-bold text-white/65"><span>Trial type</span><select name="trial_type" defaultValue="none" disabled={!canEdit} className={selectClass()}>{["none","7_days","14_days","30_days","60_days","90_days",...(isSuperadmin ? ["forever_comped"] : [])].map((v)=><option key={v}>{v}</option>)}</select></label><label className="space-y-2 text-sm font-bold text-white/65"><span>Promo code</span><input name="promo_code" defaultValue={business.promo_code || ""} disabled={!canEdit} className={inputClass()} /></label><label className="space-y-2 text-sm font-bold text-white/65"><span>Promo campaign</span><input name="promo_campaign" defaultValue={business.promo_campaign || ""} disabled={!canEdit} className={inputClass()} /></label><label className="space-y-2 text-sm font-bold text-white/65 xl:col-span-3"><span>Internal billing note</span><textarea name="billing_notes" defaultValue={business.billing_notes || ""} disabled={!canEdit} rows={4} className={inputClass()} /></label></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><StatCard label="Upgrade score" value={fmt(business.opportunity_score)} /><StatCard label="Churn risk" value={fmt(business.churn_risk_score)} /></div><button disabled={!canEdit} className="mt-5 rounded-full bg-rose-600 px-6 py-3 text-sm font-black text-white disabled:opacity-50">Save plan and billing</button>{!canEdit ? <p className="mt-3 text-sm text-white/45">Only superadmins can update plan and billing.</p> : null}</form>;
}

function QRCodePanel({ business, qrCodes, canRegenerate }: { business: BusinessCRMRow; qrCodes: any[]; canRegenerate: boolean }) {
  const current = qrCodes[0] || business;
  const code = current.claim_code || current.code;
  const url = current.qr_url || current.claim_url || current.qr_link || business.claim_url;
  return <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">QR Codes</h2><div className="flex gap-2"><Link href="/admin/dashboard/claim-qrs" className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/70">Open bulk QR page</Link>{url ? <Link href={url} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/70">Print/download QR</Link> : null}</div></div>{code || url ? <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm text-white/70"><div><dt className="text-xs text-white/40">Claim code</dt><dd>{code || "—"}</dd></div><div><dt className="text-xs text-white/40">QR URL</dt><dd className="break-all">{url || "—"}</dd></div><div><dt className="text-xs text-white/40">Status</dt><dd>{current.status || current.claim_status || "active"}</dd></div><div><dt className="text-xs text-white/40">Created</dt><dd>{formatDate(current.created_at)}</dd></div><div><dt className="text-xs text-white/40">Last scanned</dt><dd>{formatDate(current.last_scanned_at || current.last_scanned)}</dd></div><div><dt className="text-xs text-white/40">Scan count</dt><dd>{current.scan_count || current.scans || business.qr_scans_30d || 0}</dd></div></dl> : <EmptyPanel title="No claim QR code" text="No claim QR code has been generated for this location yet. Generate one here or use the bulk QR tools." />}<form action={regenerateLocationClaimQr} className="mt-5"><input type="hidden" name="location_id" value={business.id} /><button disabled={!canRegenerate} className="rounded-full bg-rose-600 px-6 py-3 text-sm font-black text-white disabled:opacity-50">Regenerate QR</button>{!canRegenerate ? <p className="mt-2 text-sm text-white/45">Admin or superadmin permission is required to regenerate QR codes.</p> : null}</form></article>;
}

function OwnerPanel({ business, owners }: { business: BusinessCRMRow; owners: any[] }) {
  const owner = owners[0] || {};
  const email = business.owner_email || owner.owner_email || owner.email;
  return <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Owner account</h2>{email || business.owner_user_id ? <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-white/70"><div><dt className="text-xs text-white/40">Owner email</dt><dd>{email || "—"}</dd></div><div><dt className="text-xs text-white/40">Owner name</dt><dd>{owner.full_name || owner.name || owner.owner_name || "—"}</dd></div><div><dt className="text-xs text-white/40">Linked date</dt><dd>{formatDate(owner.created_at || owner.linked_at)}</dd></div><div><dt className="text-xs text-white/40">Claim source</dt><dd>{owner.claim_source || owner.source || "—"}</dd></div><div><dt className="text-xs text-white/40">Owner status</dt><dd>{business.owner_status || owner.status || "linked"}</dd></div><div><dt className="text-xs text-white/40">Owner user ID</dt><dd className="break-all">{business.owner_user_id || owner.owner_user_id || "—"}</dd></div></dl> : <div className="mt-4"><EmptyPanel title="No owner linked yet" text="No owner linked yet. Use claims, invite, or a claim link to connect this location to an owner account." /><div className="mt-4 flex flex-wrap gap-2"><Link href="/admin/dashboard/claims" className="rounded-full bg-rose-600 px-4 py-2 text-sm font-black text-white">Open claims</Link><Link href={`/admin/dashboard/crm/${business.id}?tab=communication`} className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/70">Invite owner</Link><Link href={`/business/claim?location=${business.id}`} className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/70">Copy claim link</Link></div></div>}</article>;
}

function LocationSettingsPanel({ business, canEdit }: { business: BusinessCRMRow; canEdit: boolean }) {
  return <section className="grid gap-4 lg:grid-cols-[1fr_0.75fr]"><form action={saveLocationSettings} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><input type="hidden" name="location_id" value={business.id} /><h2 className="text-xl font-black">Location settings</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="space-y-2 text-sm font-bold text-white/65"><span>Active</span><select name="active" defaultValue={business.active === false ? "false" : "true"} disabled={!canEdit} className={selectClass()}><option value="true">Active</option><option value="false">Inactive</option></select></label><label className="space-y-2 text-sm font-bold text-white/65"><span>Searchable</span><select name="is_searchable" defaultValue={business.is_searchable ? "true" : "false"} disabled={!canEdit} className={selectClass()}><option value="true">Searchable</option><option value="false">Hidden from search</option></select></label><label className="space-y-2 text-sm font-bold text-white/65"><span>CRM priority</span><select name="crm_priority" defaultValue={business.crm_priority || business.priority_level || "normal"} disabled={!canEdit} className={selectClass()}>{["low","normal","high","urgent"].map((v)=><option key={v}>{v}</option>)}</select></label><label className="space-y-2 text-sm font-bold text-white/65"><span>Follow-up date</span><input type="date" name="follow_up_date" defaultValue={business.follow_up_date || ""} disabled={!canEdit} className={inputClass()} /></label><label className="space-y-2 text-sm font-bold text-white/65"><span>Outreach status</span><select name="outreach_status" defaultValue={business.outreach_status || "none"} disabled={!canEdit} className={selectClass()}>{["none","needs_outreach","contacted","follow_up","interested","not_interested","do_not_contact"].map((v)=><option key={v}>{v}</option>)}</select></label><label className="space-y-2 text-sm font-bold text-white/65"><span>CRM status</span><select name="crm_status" defaultValue={getDisplayCRMStatus(business)} disabled={!canEdit} className={selectClass()}>{["New Lead","Needs Outreach","Contacted","Follow Up","Upgrade Opportunity","Active Free","Active Pro","At Risk","Churned"].map((v)=><option key={v}>{v}</option>)}</select></label><label className="space-y-2 text-sm font-bold text-white/65 md:col-span-2"><span>Internal notes</span><textarea name="internal_notes" defaultValue={business.internal_notes || ""} disabled={!canEdit} rows={6} className={inputClass()} /></label></div><button disabled={!canEdit} className="mt-5 rounded-full bg-rose-600 px-6 py-3 text-sm font-black text-white disabled:opacity-50">Save settings</button></form><div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Danger zone</h2><details className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4"><summary className="cursor-pointer font-bold text-rose-100">Destructive controls disabled</summary><p className="mt-3 text-sm leading-6 text-white/60">Destructive controls are intentionally disabled. Use inactive/searchable controls to remove this location from public flows safely.</p><button disabled className="mt-3 rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/35">Delete location unavailable</button></details></div></section>;
}

function Panel({ title, items, empty, href, hrefLabel }: { title: string; items: any[]; empty: string; href: string; hrefLabel: string }) {
  return <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center justify-between gap-4"><h2 className="text-xl font-black">{title}</h2><Link href={href} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white/70">{hrefLabel}</Link></div>{items.length ? <ul className="mt-4 space-y-2 text-sm text-white/70">{items.map((item) => <li key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-3"><b>{item.title || item.subject || item.action || item.status || item.category || "Record"}</b><p className="mt-1 text-white/55">{item.message || item.note_body || item.description || item.owner_email || item.delivery_status || "Real record"}</p><span className="mt-1 block text-xs text-white/35">{formatDate(item.created_at || item.submitted_at || item.sent_at)}</span></li>)}</ul> : <div className="mt-4"><EmptyPanel title={`No ${title.toLowerCase()} yet`} text={empty} /></div>}</article>;
}
