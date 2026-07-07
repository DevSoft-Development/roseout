"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { clampScore } from "@/lib/clampScore";
import { getLocationScore } from "@/lib/locationScore";
import { formatFullAddress } from "@/lib/address-utils";
import { buildLocationEditorLinks, type LocationType } from "@/lib/location-editor-links";
import LocationEditorMobileNav from "./LocationEditorMobileNav";
import LocationEditorNav from "./LocationEditorNav";
import LocationEditorMenuPanel from "./LocationEditorMenuPanel";
import LocationEditorQrPanel from "./LocationEditorQrPanel";
import LocationEditorAnalyticsPanel from "./LocationEditorAnalyticsPanel";
import LocationEditorAiRecommendations from "./LocationEditorAiRecommendations";
import LocationEditorMarketingPanel from "./LocationEditorMarketingPanel";
import LocationEditorHoursPanel from "./LocationEditorHoursPanel";
import { buildLocationEditorContext } from "./location-editor-context";
import { cleanEditorHashNav, getCleanEditorActions, type CleanEditorSectionId } from "./editor-config";

type FormState = {
  name: string; description: string; phone: string; website: string; address: string; city: string; state: string; zip_code: string; neighborhood: string;
  main_image: string; image_url: string; images: string[]; hours: string; operating_hours?: unknown; is_searchable: string; data_status: string;
  cuisine: string; activity_type: string; price_range: string; primary_tag: string; primary_category: string; category: string; tags: string; semantic_tags: string; best_for_tags: string; best_for: string; vibe_tags: string; date_style_tags: string; intent_tags: string; special_features: string; search_keywords: string; short_description: string; borough: string; latitude: string | number; longitude: string | number; google_place_id: string; formatted_address: string;
};

type Links = ReturnType<typeof buildLocationEditorLinks>;

const fieldClass = "w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-[#e1062a]/70 focus:ring-4 focus:ring-[#e1062a]/10";
const secondaryButtonClass = "inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white/70 transition hover:bg-white/[0.08] hover:text-white";
const primaryButtonClass = "inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-[#ff1654]/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";

function normalizeLocationTypeParam(value: string): LocationType | null {
  if (value === "restaurants" || value === "restaurant") return "restaurants";
  if (value === "activities" || value === "activity" || value === "activitys") return "activities";
  return null;
}
function serializeForm(form: FormState) { return JSON.stringify(form); }
function toArray(value: string) { const seen = new Set<string>(); const out: string[] = []; for (const item of String(value || "").split(",")) { const clean = item.trim().replace(/\s+/g, " "); const key = clean.toLowerCase(); if (clean && !seen.has(key)) { seen.add(key); out.push(clean); } } return out; }
function publicStatusLabel(form: FormState) {
  if (String(form.data_status || "").toLowerCase().includes("review")) return "Needs Review";
  if (form.is_searchable === "false") return "Hidden from search";
  if (form.is_searchable === "true") return "Searchable";
  if (["approved", "active", "published", "complete"].some((term) => String(form.data_status || "").toLowerCase().includes(term))) return "Published";
  return "Draft";
}
function currentHashSection(): CleanEditorSectionId {
  if (typeof window === "undefined") return "overview";
  const raw = window.location.hash.replace("#", "");
  const match = cleanEditorHashNav.find((item) => item.sectionId === raw || item.href === `#${raw}`);
  return match?.sectionId || "overview";
}
function splitTags(value: string, fallback: string[] = []) {
  const tags = toArray(value);
  return tags.length ? tags : fallback;
}

export default function CleanLocationEditor() {
  useEffect(() => { document.title = "Edit Location | TheOutHaven"; }, []);
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const type = normalizeLocationTypeParam(String(params.type || ""));
  const locationId = String(params.locationId || "");
  const table = type || "restaurants";
  const nameField = type === "activities" ? "activity_name" : "restaurant_name";
  const isDemoMode = searchParams.get("demo") === "1" || searchParams.get("fromDemoCenter") === "1";
  const fromDemoCenter = searchParams.get("fromDemoCenter") === "1";
  const adminLocationIdParam = searchParams.get("adminLocationId");
  const from = searchParams.get("from") || "/locations/dashboard";

  const [activeSectionId, setActiveSectionId] = useState<CleanEditorSectionId>("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isAdminContext, setIsAdminContext] = useState(false);
  const [canonicalId, setCanonicalId] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [effectiveId, setEffectiveId] = useState(locationId);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [form, setForm] = useState<FormState>({ name: "", description: "", phone: "", website: "", address: "", city: "", state: "", zip_code: "", neighborhood: "", main_image: "", image_url: "", images: [], hours: "", operating_hours: null, is_searchable: "", data_status: "", cuisine: "", activity_type: "", price_range: "", primary_tag: "", primary_category: "", category: "", tags: "", semantic_tags: "", best_for_tags: "", best_for: "", vibe_tags: "", date_style_tags: "", intent_tags: "", special_features: "", search_keywords: "", short_description: "", borough: "", latitude: "", longitude: "", google_place_id: "", formatted_address: "" });
  const [analyticsSummary, setAnalyticsSummary] = useState<Record<string, number>>({});
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    setActiveSectionId(currentHashSection());
    const onHashChange = () => setActiveSectionId(currentHashSection());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!locationId || !type) return;
    let cancelled = false;
    async function loadLocation() {
      setLoading(true); setMessage("");
      try {
        const res = await fetch(`/api/locations/edit-context?type=${table}&id=${encodeURIComponent(locationId)}`, { cache: "no-store" });
        const result = await res.json();
        if (!res.ok || !result.location) { setMessage(result.error || "Location not found."); return; }
        const data = result.location;
        const nextCanonicalId = result.canonicalId || data.canonical_location_id || null;
        const nextSourceId = result.sourceId || data.legacy_source_id || data.source_id || null;
        const nextForm: FormState = {
          name: data[nameField] || data.name || "", description: data.description || "", phone: data.phone || "", website: data.website || "",
          address: data.address || "", city: data.city || "", state: data.state || "", zip_code: data.zip_code || "", neighborhood: data.neighborhood || "",
          main_image: data.main_image || data.image_url || "", image_url: data.image_url || data.main_image || "", images: Array.isArray(data.images) ? data.images.filter(Boolean) : [],
          hours: data.hours || "", operating_hours: data.operating_hours ?? null, is_searchable: typeof data.is_searchable === "boolean" ? String(data.is_searchable) : "", data_status: data.data_status || "",
          cuisine: data.cuisine || "", activity_type: data.activity_type || "", price_range: data.price_range || "", primary_tag: data.primary_tag || "", primary_category: data.primary_category || "", category: data.category || "", tags: Array.isArray(data.tags) ? data.tags.join(", ") : data.tags || "", semantic_tags: Array.isArray(data.semantic_tags) ? data.semantic_tags.join(", ") : data.semantic_tags || "", best_for_tags: Array.isArray(data.best_for_tags) ? data.best_for_tags.join(", ") : data.best_for_tags || "", best_for: Array.isArray(data.best_for) ? data.best_for.join(", ") : data.best_for || "", vibe_tags: Array.isArray(data.vibe_tags) ? data.vibe_tags.join(", ") : data.vibe_tags || "", date_style_tags: Array.isArray(data.date_style_tags) ? data.date_style_tags.join(", ") : data.date_style_tags || "", intent_tags: Array.isArray(data.intent_tags) ? data.intent_tags.join(", ") : data.intent_tags || "", special_features: Array.isArray(data.special_features) ? data.special_features.join(", ") : data.special_features || "", search_keywords: Array.isArray(data.search_keywords) ? data.search_keywords.join(", ") : data.search_keywords || "", short_description: data.short_description || "", borough: data.borough || "",
          latitude: data.latitude ?? "", longitude: data.longitude ?? "", google_place_id: data.google_place_id || "", formatted_address: data.formatted_address || "",
        };
        if (cancelled) return;
        setIsAdminContext(Boolean(result.isAdmin || result.isImpersonating));
        setCanonicalId(nextCanonicalId ? String(nextCanonicalId) : ""); setSourceId(nextSourceId ? String(nextSourceId) : null); setEffectiveId(String(result.effectiveId || nextCanonicalId || nextSourceId || locationId));
        setForm(nextForm); setSavedSnapshot(serializeForm(nextForm));
      } catch { if (!cancelled) setMessage("Location failed to load."); }
      finally { if (!cancelled) setLoading(false); }
    }
    loadLocation();
    return () => { cancelled = true; };
  }, [locationId, type, table, nameField]);

  const editorContext = buildLocationEditorContext({ type: table as LocationType, locationId, canonicalId: canonicalId || undefined, sourceId, effectiveId, adminLocationId: adminLocationIdParam, isDemoMode, isAdminContext, fromDemoCenter });
  const links = buildLocationEditorLinks({ type: table as LocationType, locationId, canonicalId: canonicalId || undefined, sourceId, effectiveId: editorContext.effectiveLocationId, adminContext: isAdminContext, adminLocationId: adminLocationIdParam, isDemoMode, fromDemoCenter, searchParams });

  useEffect(() => {
    if (!editorContext.effectiveLocationId) return;
    let cancelled = false;
    const qs = new URLSearchParams({ location_id: editorContext.effectiveLocationId, range: "30d" });
    if (editorContext.isAdminContext || editorContext.isDemoMode) qs.set("admin", "1");
    setAnalyticsLoading(true);
    fetch(`/api/business/analytics?${qs.toString()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => { if (!cancelled) setAnalyticsSummary(json?.summary || {}); })
      .catch(() => { if (!cancelled) setAnalyticsSummary({}); })
      .finally(() => { if (!cancelled) setAnalyticsLoading(false); });
    return () => { cancelled = true; };
  }, [editorContext.effectiveLocationId, editorContext.isAdminContext, editorContext.isDemoMode]);
  const cancelHref = isDemoMode ? links.dashboard : from;
  const hasUnsavedChanges = savedSnapshot !== "" && serializeForm(form) !== savedSnapshot;
  const mainImage = form.main_image || form.image_url || "";
  const galleryImages = Array.from(new Set([mainImage, ...form.images].filter(Boolean)));
  const score = useMemo(() => clampScore(getLocationScore(form)), [form]);
  const contextLabel = isDemoMode ? "Demo mode" : isAdminContext || Boolean(adminLocationIdParam) ? "Admin location mode" : "Owner mode";
  const locationKind = type === "restaurants" ? "Restaurant" : "Activity";
  const categoryLabel = type === "restaurants" ? form.cuisine || form.category || "Restaurant" : form.activity_type || form.category || "Activity";
  const update = (key: keyof FormState, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const setMainImage = (url: string) => setForm((prev) => ({ ...prev, main_image: url, image_url: url, images: Array.from(new Set([...prev.images, url])).filter(Boolean) }));
  const selectTab = (sectionId: CleanEditorSectionId) => { setActiveSectionId(sectionId); if (typeof window !== "undefined") window.history.replaceState(null, "", `#${sectionId}`); };
  const resetForm = () => { if (!savedSnapshot) return; try { setForm(JSON.parse(savedSnapshot)); setMessage("Draft changes reset."); } catch { setMessage("Could not reset draft changes."); } };

  async function saveLocation() {
    setSaving(true); setMessage("");
    const payload: Record<string, unknown> = { [nameField]: form.name, name: form.name, description: form.description, phone: form.phone, website: form.website, address: form.address, city: form.city, state: form.state, zip_code: form.zip_code, neighborhood: form.neighborhood, main_image: form.main_image || form.image_url || null, image_url: form.image_url || form.main_image || null, images: form.images, hours: form.hours, operating_hours: form.operating_hours ?? null, is_searchable: form.is_searchable === "" ? null : form.is_searchable === "true", data_status: form.data_status || null, price_range: form.price_range, primary_tag: form.primary_tag, primary_category: form.primary_category, category: form.category, tags: toArray(form.tags), semantic_tags: toArray(form.semantic_tags), best_for_tags: toArray(form.best_for_tags), best_for: toArray(form.best_for), vibe_tags: toArray(form.vibe_tags), date_style_tags: toArray(form.date_style_tags), intent_tags: toArray(form.intent_tags), special_features: toArray(form.special_features), search_keywords: toArray(form.search_keywords), short_description: form.short_description, borough: form.borough, latitude: form.latitude === "" ? null : Number(form.latitude), longitude: form.longitude === "" ? null : Number(form.longitude), google_place_id: form.google_place_id || null, formatted_address: form.formatted_address || null, theouthaven_score: score };
    if (type === "restaurants") payload.cuisine = form.cuisine;
    if (type === "activities") payload.activity_type = form.activity_type;
    try {
      const res = await fetch("/api/locations/edit-context", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: table, id: canonicalId || effectiveId || locationId, payload }) });
      const result = await res.json();
      if (!res.ok) { setMessage(result.error || "Failed to save location."); return; }
      if (result.canonicalId) setCanonicalId(String(result.canonicalId)); if ("sourceId" in result) setSourceId(result.sourceId ? String(result.sourceId) : null); setEffectiveId(String(result.canonicalId || result.effectiveId || result.sourceId || effectiveId));
      setSavedSnapshot(serializeForm(form)); setMessage(`Saved successfully. TheOutHaven Score: ${score}/100`);
    } catch { setMessage("Failed to save location."); }
    finally { setSaving(false); }
  }

  if (!type) return <main className="flex min-h-screen items-center justify-center bg-[#050607] px-5 text-white"><div className="rounded-[2rem] border border-red-400/30 bg-red-400/10 p-8 text-center"><h1 className="text-3xl font-black">Location edit link is invalid.</h1></div></main>;
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white"><div className="rounded-[28px] border border-white/10 bg-white/[0.06] px-10 py-8 text-center"><p className="text-sm font-black uppercase tracking-[0.3em] text-white/65">Loading Location</p></div></main>;

  const setOperatingHours = (operatingHours: unknown, summary: string) => setForm((prev) => ({ ...prev, operating_hours: operatingHours, hours: summary }));
  const tabProps = { form, type, categoryLabel, mainImage, galleryImages, score, update, setMainImage, setOperatingHours, editorContext, links, isAdminContext, isDemoMode, analyticsSummary, analyticsLoading, selectTab };

  return (
    <main className="min-h-screen bg-[#050607] text-white">
      <LocationEditorNav links={links} activeSectionId={activeSectionId} onSectionSelect={selectTab} />
      <section className="min-h-screen lg:pl-[280px]">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#050607]/95 backdrop-blur-xl">
          <div className="flex flex-col gap-4 px-4 py-4 md:px-6 2xl:px-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <LocationEditorMobileNav links={links} activeSectionId={activeSectionId} onSectionSelect={selectTab} />
              <div className="min-w-0">
                <p className="truncate text-xs font-black uppercase tracking-[0.22em] text-white/40">Locations &gt; {locationKind}s &gt; {form.name || "Location"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-black tracking-tight md:text-3xl">Location Editor</h1>
                  <span className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-white/75">{form.name || "Selected location"} · {formatFullAddress({ address: form.address, city: form.city, state: form.state, zip_code: form.zip_code, fallback: "Address pending" })}</span>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-black text-emerald-200">● Draft</span>
                  <span className="text-xs font-bold text-white/35">{hasUnsavedChanges ? "Unsaved changes" : "Autosaved locally"}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black uppercase tracking-wide text-white/45">{contextLabel}</span>
              <button type="button" onClick={() => router.push(cancelHref)} className={secondaryButtonClass}>Cancel</button>
              <button type="button" onClick={saveLocation} disabled={saving} className={primaryButtonClass}>{saving ? "Saving..." : "Save Changes"}</button>
              <Link href={links.publicPage} className={`${secondaryButtonClass} border-[#e1062a]/50 text-white`}>Public Preview ↗</Link>
            </div>
          </div>
          <div className="min-w-0 overflow-x-auto px-4 pb-4 md:px-6 2xl:px-8" aria-label="Location editor tabs">
            <div className="flex w-max min-w-full gap-2 whitespace-nowrap">
              {cleanEditorHashNav.map((tab) => <button type="button" key={tab.href} onClick={() => selectTab(tab.sectionId)} className={`shrink-0 rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition sm:px-4 sm:text-[11px] ${activeSectionId === tab.sectionId ? "border-[#ff2142]/55 bg-[#e1062a]/20 text-white shadow-lg shadow-[#e1062a]/10" : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white"}`}>{tab.label}</button>)}
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1680px] gap-6 px-4 py-6 pb-32 md:px-6 2xl:px-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            {message ? <div className="rounded-[24px] border border-white/10 bg-white/[0.06] p-4 text-sm font-bold text-white">{message}</div> : null}
            {activeSectionId === "overview" ? <OverviewTab {...tabProps} /> : null}
            {activeSectionId === "details" ? <DetailsTab {...tabProps} /> : null}
            {activeSectionId === "public-profile" ? <PublicProfileTab {...tabProps} publicStatus={publicStatusLabel(form)} /> : null}
            {activeSectionId === "search-enhancements" ? <SearchEnhancementsTab {...tabProps} /> : null}
            {activeSectionId === "photos" ? <PhotosTab {...tabProps} /> : null}
            {activeSectionId === "hours" ? <HoursTab {...tabProps} /> : null}
            {activeSectionId === "menu" ? <MenuTab {...tabProps} /> : null}
            {activeSectionId === "qr-codes" ? <QrTab {...tabProps} /> : null}
            {activeSectionId === "analytics" ? <AnalyticsTab {...tabProps} /> : null}
            {activeSectionId === "marketing-center" ? <MarketingTab {...tabProps} /> : null}
          </div>
          <LocationEditorRightRail form={form} links={links} score={score} activeSectionId={activeSectionId} mainImage={mainImage} categoryLabel={categoryLabel} isAdminOrDemo={isAdminContext || isDemoMode} analyticsSummary={analyticsSummary} />
        </div>
        {hasUnsavedChanges ? <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#050607]/95 px-4 py-3 shadow-[0_-20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:left-[280px]">
          <div className="mx-auto flex max-w-[1680px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-white">Unsaved changes</p>
              <p className="text-xs font-bold text-white/45">Save to update this location. Hours changes are saved here too.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={resetForm} disabled={saving} className={secondaryButtonClass}>Reset</button>
              <button type="button" onClick={saveLocation} disabled={saving} className={primaryButtonClass}>{saving ? "Saving..." : "Save Changes"}</button>
            </div>
          </div>
        </div> : null}
      </section>
    </main>
  );
}

type TabProps = {
  form: FormState;
  type: LocationType | null;
  categoryLabel: string;
  mainImage: string;
  galleryImages: string[];
  score: number;
  update: (key: keyof FormState, value: string) => void;
  setMainImage: (url: string) => void;
  setOperatingHours: (operatingHours: unknown, summary: string) => void;
  editorContext: ReturnType<typeof buildLocationEditorContext>;
  links: Links;
  isAdminContext: boolean;
  isDemoMode: boolean;
  analyticsSummary: Record<string, number>;
  analyticsLoading: boolean;
  selectTab: (sectionId: CleanEditorSectionId) => void;
};

function OverviewTab({ form, score, mainImage, categoryLabel, analyticsSummary, analyticsLoading, selectTab }: TabProps) {
  const s = analyticsSummary || {};
  const reserveClicks = num(s.reserve_clicks) + num((s as any).reservation_starts);
  return <div className="space-y-6">
    <PanelHeader eyebrow="Overview" title="Business Overview" description="Live analytics from the existing TheOutHaven analytics system. Zero means no tracked events yet." action={<span className="rounded-2xl border border-white/10 px-3 py-2 text-xs font-black text-white/55">{analyticsLoading ? "Loading live data..." : "Live · Last 30 Days"}</span>} />
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
      <MetricCard label="Profile Views" value={formatMetric(s.profile_views)} trend="Live 30d" />
      <MetricCard label="Reservations" value={formatMetric(reserveClicks)} trend="Live 30d" />
      <MetricCard label="Direction Requests" value={formatMetric(s.directions_clicks)} trend="Live 30d" />
      <MetricCard label="Website Clicks" value={formatMetric(s.website_clicks || s.search_clicks)} trend="Live 30d" />
      <MetricCard label="Calls" value={formatMetric(s.phone_clicks || s.call_clicks)} trend="Live 30d" />
    </div>
    <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
      <EditorCard title="Profile Performance" description="How customers discover and engage with your profile.">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <ProgressRing value={score} label="Profile Strength" />
          <div className="grid flex-1 gap-3 text-sm font-bold text-white/70">
            <ScoreRow label="Complete & Accurate" value={score} />
            <ScoreRow label="Photos & Media" value={mainImage ? 88 : 42} />
            <ScoreRow label="Hours & Info" value={form.hours || form.operating_hours ? 90 : 58} />
            <ScoreRow label="Menu & Offerings" value={form.tags ? 80 : 64} />
          </div>
        </div>
      </EditorCard>
      <EditorCard title="Reservations Snapshot" description="Reservation performance across connected channels.">
        <StackedRows rows={[["Reserve clicks", formatMetric(s.reserve_clicks), ""], ["Outing starts", formatMetric(s.outing_starts), ""], ["Completed outings", formatMetric(s.completed_outings), ""], ["Phone/call clicks", formatMetric(s.phone_clicks || s.call_clicks), ""]]} />
      </EditorCard>
    </div>
    <div className="grid gap-5 xl:grid-cols-3">
      <EditorCard title="Recent Activity" description="Latest changes and updates."><ActivityList /></EditorCard>
      <EditorCard title="Readiness Checklist" description="Complete these steps to maximize your profile."><Checklist form={form} selectTab={selectTab} /></EditorCard>
      <EditorCard title="Quick Actions" description="Common tasks for this location."><ActionRows selectTab={selectTab} /></EditorCard>
    </div>
    <EditorCard title="Public profile snapshot" description="How this location card should feel in customer-facing surfaces.">
      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <MediaBox src={mainImage} alt="Location" className="h-56" />
        <div className="space-y-4"><div><h3 className="text-3xl font-black">{form.name || "Location Name"}</h3><p className="mt-2 text-sm font-bold text-white/55">★ 4.7 · {categoryLabel} · {form.price_range || "$$"}</p></div><p className="max-w-3xl text-sm leading-6 text-white/60">{form.description || form.short_description || "Add a warm, concise public description that tells guests why this location is worth choosing."}</p><ChipCloud values={splitTags(form.best_for_tags || form.vibe_tags, ["Date night", "Outdoor seating", "Craft cocktails", "Groups"])} /></div>
      </div>
    </EditorCard>
  </div>;
}

function DetailsTab({ form, type, update }: TabProps) {
  return <div className="grid gap-5 xl:grid-cols-2">
    <EditorCard title="Business Information" description="Core identity fields used across admin, search, and public surfaces.">
      <FieldRow><TextInput label="Business Name" value={form.name} onChange={(v) => update("name", v)} /><TextInput label={type === "restaurants" ? "Cuisine Type" : "Activity Type"} value={type === "restaurants" ? form.cuisine : form.activity_type} onChange={(v) => update(type === "restaurants" ? "cuisine" : "activity_type", v)} /></FieldRow>
      <FieldRow><TextInput label="Category" value={form.category} onChange={(v) => update("category", v)} /><TextInput label="Primary Tag" value={form.primary_tag} onChange={(v) => update("primary_tag", v)} /></FieldRow>
      <TextInput label="Tagline / Short Description" value={form.short_description} onChange={(v) => update("short_description", v)} />
    </EditorCard>
    <EditorCard title="Contact Information" description="Make guest actions easy and visible.">
      <TextInput label="Phone" value={form.phone} onChange={(v) => update("phone", v)} />
      <TextInput label="Website" value={form.website} onChange={(v) => update("website", v)} />
      <ReadOnlyInput label="Google Place ID" value={form.google_place_id || "Not connected"} help="Imported from Google and locked to protect data integrity." />
    </EditorCard>
    <EditorCard title="Location & Address" description="Address details and geo targeting for maps/search.">
      <TextInput label="Street Address" value={form.address} onChange={(v) => update("address", v)} />
      <FieldRow><TextInput label="City" value={form.city} onChange={(v) => update("city", v)} /><TextInput label="State" value={form.state} onChange={(v) => update("state", v)} /></FieldRow>
      <FieldRow><TextInput label="Zip Code" value={form.zip_code} onChange={(v) => update("zip_code", v)} /><TextInput label="Neighborhood" value={form.neighborhood} onChange={(v) => update("neighborhood", v)} /></FieldRow>
      <FieldRow><TextInput label="Latitude" value={String(form.latitude ?? "")} onChange={(v) => update("latitude", v)} /><TextInput label="Longitude" value={String(form.longitude ?? "")} onChange={(v) => update("longitude", v)} /></FieldRow>
    </EditorCard>
    <EditorCard title="Price & Dining" description="Set expectations before guests click.">
      <FieldRow><TextInput label="Price Tier" value={form.price_range} onChange={(v) => update("price_range", v)} /><TextInput label="Borough" value={form.borough} onChange={(v) => update("borough", v)} /></FieldRow>
      <div className="grid grid-cols-4 gap-2">{["$", "$$", "$$$", "$$$$"].map((tier) => <button key={tier} type="button" onClick={() => update("price_range", tier)} className={`rounded-2xl border px-4 py-3 text-sm font-black ${form.price_range === tier ? "border-[#ff2142] bg-[#e1062a]/20 text-white" : "border-white/10 bg-black/25 text-white/55"}`}>{tier}</button>)}</div>
    </EditorCard>
    <EditorCard title="About Your Business" description="Use polished copy that works in search and on the public profile." className="xl:col-span-2">
      <TextArea label="Description" value={form.description} onChange={(v) => update("description", v)} rows={8} />
    </EditorCard>
  </div>;
}

function PublicProfileTab({ form, update, mainImage, galleryImages, categoryLabel, publicStatus }: TabProps & { publicStatus: string }) {
  return <div className="grid gap-5 2xl:grid-cols-[minmax(0,.95fr)_minmax(0,1.25fr)]">
    <div className="space-y-5">
      <EditorCard title="Discovery & Visibility" description="Control how this location appears to guests online." action={<StatusPill>{publicStatus}</StatusPill>}>
        <FieldRow><SelectInput label="Search Visibility" value={form.is_searchable} onChange={(v) => update("is_searchable", v)} /><TextInput label="Data Status" value={form.data_status} onChange={(v) => update("data_status", v)} /></FieldRow>
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><MiniStatus label="Search engines" value="Visible" /><MiniStatus label="TheOutHaven" value="Visible" /><MiniStatus label="Maps & directories" value="Ready" /></div>
      </EditorCard>
      <EditorCard title="Branding" description="Primary media and profile branding.">
        <TextInput label="Primary Image URL" value={mainImage} onChange={(v) => update("main_image", v)} />
        <div className="mt-4 grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]"><MediaBox src={mainImage} alt="Profile" className="h-28" /><div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Logo</p><p className="mt-2 text-sm font-bold text-white/60">Square logo upload can plug into your existing media system later.</p></div></div>
      </EditorCard>
      <EditorCard title="Public Copy" description="What guests read before taking action."><TextArea label="Short Description" value={form.short_description} onChange={(v) => update("short_description", v)} rows={3} /><TextArea label="Full Description" value={form.description} onChange={(v) => update("description", v)} rows={6} /></EditorCard>
      <EditorCard title="Links" description="Guest actions shown on the profile."><FieldRow><TextInput label="Website" value={form.website} onChange={(v) => update("website", v)} /><TextInput label="Phone" value={form.phone} onChange={(v) => update("phone", v)} /></FieldRow><ReadOnlyInput label="Public Address" value={formatFullAddress({ address: form.address, city: form.city, state: form.state, zip_code: form.zip_code, fallback: "Not set" })} help="Edit the address from the Details tab." /></EditorCard>
    </div>
    <EditorCard title="Live Public Profile Preview" description="Large customer-facing preview, no empty Preview rail.">
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#090d13]">
        <MediaBox src={mainImage} alt="Preview" className="h-64 rounded-none" />
        <div className="p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-3xl font-black">{form.name || "Location Name"}</h3><p className="mt-2 text-sm font-bold text-white/55">★ 4.7 · {categoryLabel} · {form.price_range || "$$"}</p></div><StatusPill>Open</StatusPill></div><p className="mt-4 max-w-3xl text-sm leading-6 text-white/60">{form.description || form.short_description || "Public description will appear here."}</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><button className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-white/75">Call</button><button className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-white/75">Directions</button><button className="rounded-2xl bg-[#ff2142] px-4 py-3 text-sm font-black text-white">View Menu</button></div><ChipCloud values={splitTags(form.best_for_tags || form.vibe_tags, ["Great for dinner", "Outdoor seating", "Craft cocktails", "Groups"])} /><div className="mt-5 grid grid-cols-4 gap-3">{galleryImages.slice(0, 4).map((image) => <MediaBox key={image} src={image} alt="Gallery" className="h-24" />)}</div></div>
      </div>
    </EditorCard>
  </div>;
}

function SearchEnhancementsTab({ form, type, update, editorContext }: TabProps) {
  return <div className="space-y-5">
    <EditorCard title="AI Search Recommendations" description="Owner-safe suggestions to improve discoverability." action={<span className="rounded-2xl border border-white/10 px-3 py-2 text-xs font-black text-white/55">Beta</span>}>
      <LocationEditorAiRecommendations context={editorContext} form={form} targetSection="search-enhancements" onApply={(patch) => Object.entries(patch).forEach(([key, value]) => update(key as keyof FormState, String(value ?? "")))} />
    </EditorCard>
    <EditorCard title="Discovery Fields" description="These fields drive TheOutHaven matching, recommendations, and local intent.">
      <FieldRow><TextInput label="Primary Tag" value={form.primary_tag} onChange={(v) => update("primary_tag", v)} /><TextInput label="Primary Category" value={form.primary_category} onChange={(v) => update("primary_category", v)} /></FieldRow>
      <FieldRow><TextInput label="Cuisine / Activity Type" value={type === "restaurants" ? form.cuisine : form.activity_type} onChange={(v) => update(type === "restaurants" ? "cuisine" : "activity_type", v)} /><TextInput label="Category" value={form.category} onChange={(v) => update("category", v)} /></FieldRow>
      <FieldRow><TextInput label="Neighborhood" value={form.neighborhood} onChange={(v) => update("neighborhood", v)} /><TextInput label="Borough" value={form.borough} onChange={(v) => update("borough", v)} /></FieldRow>
      <TagEditor label="Keywords" value={form.search_keywords} onChange={(v) => update("search_keywords", v)} fallback={["date night", "happy hour", "private dining", "rooftop"]} />
      <TagEditor label="Vibe Tags" value={form.vibe_tags} onChange={(v) => update("vibe_tags", v)} fallback={["cozy", "elegant", "romantic", "upscale"]} />
      <TagEditor label="Best For" value={form.best_for_tags} onChange={(v) => update("best_for_tags", v)} fallback={["casual dining", "group events"]} />
      <TagEditor label="All Extra Search Tags" value={form.semantic_tags} onChange={(v) => update("semantic_tags", v)} fallback={["seasonal menu", "locally sourced", "award winning"]} />
    </EditorCard>
  </div>;
}

function PhotosTab({ mainImage, galleryImages, setMainImage }: TabProps) {
  return <div className="space-y-5">
    <PanelHeader eyebrow="Photos" title="Photo Manager" description="Showcase the location with a larger media workspace." action={<div className="flex gap-2"><button className={secondaryButtonClass}>Upload Photos</button><button className={secondaryButtonClass}>Drag & drop</button></div>} />
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
      <EditorCard title="Cover Photo" description="This is the primary image customers see first."><MediaBox src={mainImage} alt="Cover" className="h-[420px]" /><button className="mt-4 rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-white/75">Change Cover</button></EditorCard>
      <EditorCard title="Photo Details" description="Metadata and quality guidance."><StackedRows rows={[["File name", mainImage ? "primary-location-image" : "No image set", ""], ["Resolution", "Recommended 2000px+", ""], ["Usage", "Cover / Interior", ""]]} /><TextArea label="Alt Text" value="Cozy dining area with warm lighting and modern decor" onChange={() => undefined} rows={4} /></EditorCard>
    </div>
    <EditorCard title={`All Photos (${galleryImages.length})`} description="Drag and drop to reorder photos. Changes are saved when the location is saved.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">{galleryImages.length ? galleryImages.slice(0, 18).map((image, index) => <button type="button" key={`${image}-${index}`} onClick={() => setMainImage(image)} className={`overflow-hidden rounded-2xl border text-left ${index === 0 ? "border-[#ff2142] bg-[#e1062a]/10" : "border-white/10 bg-black/25"}`}><MediaBox src={image} alt="Gallery" className="h-32 rounded-none" /><span className="block px-3 py-2 text-xs font-black text-white/65">{index + 1}{index === 0 ? " · Cover" : ""}</span></button>) : <EmptyState title="No photos yet" description="Add a primary image URL in Details or Public Profile to begin." />}</div>
    </EditorCard>
  </div>;
}

function HoursTab({ form, setOperatingHours, editorContext, isAdminContext }: TabProps) {
  return <div className="space-y-5"><PanelHeader eyebrow="Hours" title="Hours & Availability" description="Set regular weekly hours, service windows, capacity, and exceptions. Changes become live after Save Changes." action={<button className={secondaryButtonClass}>Add Exception</button>} /><EditorCard title="Weekly Hours" description="Changes update the location draft immediately and are committed by the sticky Save Changes button."><LocationEditorHoursPanel value={form.operating_hours} importedHours={(form as any).google_regular_opening_hours} isAdmin={isAdminContext} onChange={(operatingHours, summary) => setOperatingHours(operatingHours, summary)} /></EditorCard><EditorCard title="Weekly Summary" description="Customer-facing hours preview."><StackedRows rows={[["Current hours text", form.hours || "Not configured", ""], ["Public profile", "Shown when configured", ""], ["Editor context", editorContext.effectiveLocationId, ""]]} /></EditorCard></div>;
}
function MenuTab({ editorContext, links }: TabProps) {
  return <div className="space-y-5"><PanelHeader eyebrow="Menu" title="Menu Editor" description="A larger three-panel workspace for sections, items, and item details." action={<span className="rounded-2xl border border-white/10 px-3 py-2 text-xs font-black text-white/55">Use the menu buttons below</span>} /><div className="rounded-[28px] border border-white/10 bg-[#0c1017] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.35)]"><LocationEditorMenuPanel context={editorContext} returnHref={links.edit} /></div></div>;
}

function QrTab({ editorContext, links }: TabProps) { return <div className="space-y-5"><PanelHeader eyebrow="QR Codes" title="QR Code Command Center" description="Generate, repair, view, copy, print, and download location-scoped QR codes." action={<button className={primaryButtonClass}>Create QR Code</button>} /><LocationEditorQrPanel context={editorContext} links={links} /></div>; }
function AnalyticsTab({ editorContext }: TabProps) { return <div className="space-y-5"><PanelHeader eyebrow="Analytics" title="Location Analytics" description="Performance, customer actions, search visibility, and conversion metrics." action={<button className={secondaryButtonClass}>Export</button>} /><LocationEditorAnalyticsPanel context={editorContext} /></div>; }
function MarketingTab({ editorContext, form }: TabProps) { return <div className="space-y-5"><PanelHeader eyebrow="Marketing" title="Market smarter. Grow stronger." description="Create location-scoped marketing drafts and open existing Growth Pro tools." action={<button className={primaryButtonClass}>Create Campaign</button>} /><LocationEditorMarketingPanel context={editorContext} form={form} /></div>; }

function LocationEditorRightRail({ form, links, score, activeSectionId, mainImage, categoryLabel, isAdminOrDemo, analyticsSummary }: { form: FormState; links: Links; score: number; activeSectionId: CleanEditorSectionId; mainImage: string; categoryLabel: string; isAdminOrDemo: boolean; analyticsSummary: Record<string, number> }) {
  const actions = getCleanEditorActions(links, isAdminOrDemo);
  return <aside className="space-y-5 xl:sticky xl:top-[150px] xl:self-start">
    <RightRailCard title={activeSectionId === "overview" ? "Live Public Preview" : "Preview"} description="Live public profile preview">
      <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#080b10]"><MediaBox src={mainImage} alt="Preview" className="h-24 rounded-none" /><div className="p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-black">{form.name || "Location Name"}</h3><p className="mt-1 text-xs font-bold text-white/55">★ 4.7 · {categoryLabel} · {form.price_range || "$$"}</p></div><StatusPill>Open</StatusPill></div><p className="mt-3 line-clamp-2 text-xs leading-5 text-white/55">{form.short_description || form.description || "Public description will appear here."}</p><div className="mt-3 space-y-2 text-xs font-semibold text-white/55"><p>{formatFullAddress({ address: form.address, city: form.city, state: form.state, zip_code: form.zip_code, fallback: "Address not set" })}</p><p>{form.phone || "Phone not set"}</p><p>{form.website || "Website not set"}</p></div><Link href={links.publicPage} className="mt-4 flex w-full justify-center rounded-2xl bg-[#ff2142] px-4 py-3 text-sm font-black text-white">View Full Profile</Link></div></div>
    </RightRailCard>
    <RightRailCard title="Profile Readiness"><div className="flex items-center gap-5"><ProgressRing value={score} compact /><div className="min-w-0 flex-1"><ChecklistMini label="Basic Info" ok={Boolean(form.name && form.address)} /><ChecklistMini label="Photos" ok={Boolean(mainImage)} /><ChecklistMini label="Hours" ok={Boolean(form.hours || form.operating_hours)} /><ChecklistMini label="Menu" ok /><ChecklistMini label="Search Enhancements" ok={Boolean(form.search_keywords || form.tags)} /></div></div><button type="button" onClick={() => window.history.replaceState(null, "", "#search-enhancements")} className="mt-4 block text-left text-xs font-black text-[#ff2142]">View All Recommendations →</button></RightRailCard>
    <RightRailCard title="Search Visibility" description="Live values from business analytics when events exist."><div className="mb-4 flex items-center justify-between"><span className="text-sm font-black text-white">{publicStatusLabel(form)}</span><StatusPill>{form.is_searchable === "false" ? "Hidden" : "Live"}</StatusPill></div><div className="grid grid-cols-3 gap-3 text-xs"><MiniMetric label="Appearances" value={formatMetric(analyticsSummary.search_appearances)} /><MiniMetric label="Views" value={formatMetric(analyticsSummary.profile_views)} /><MiniMetric label="Clicks" value={formatMetric(analyticsSummary.search_clicks)} /></div><p className="mt-4 text-xs font-black text-[#ff2142]">View Search Insights →</p></RightRailCard>
    <RightRailCard title="Quick Actions"><div className="grid gap-2">{actions.slice(0, 5).map((item) => <Link key={item.label} href={item.href} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-xs font-black text-white/65 transition hover:bg-white/[0.06] hover:text-white"><span>{item.label}</span><span>→</span></Link>)}</div></RightRailCard>
  </aside>;
}

function PanelHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <section className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,.18),transparent_34%),linear-gradient(135deg,#111722,#080b10)] p-5 shadow-[0_24px_80px_rgba(0,0,0,.28)]"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.26em] text-[#ff9bb6]">{eyebrow}</p><h2 className="mt-2 text-2xl font-black tracking-tight">{title}</h2><p className="mt-1 text-sm font-semibold text-white/50">{description}</p></div>{action}</div></section>; }
function EditorCard({ title, description, action, children, className = "" }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) { return <section className={`rounded-[28px] border border-white/10 bg-[#0c1017] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] ${className}`}><div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-black">{title}</h2>{description ? <p className="mt-1 text-sm leading-6 text-white/50">{description}</p> : null}</div>{action}</div>{children}</section>; }
function RightRailCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) { return <section className="rounded-[24px] border border-white/10 bg-[#10141b] p-4 shadow-xl shadow-black/20"><h3 className="text-sm font-black text-white">{title}</h3>{description ? <p className="mt-1 text-xs font-semibold text-white/45">{description}</p> : null}<div className="mt-4">{children}</div></section>; }
function FieldRow({ children }: { children: ReactNode }) { return <div className="grid gap-4 md:grid-cols-2">{children}</div>; }
function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={fieldClass} /></label>; }
function TextArea({ label, value, onChange, rows = 4 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) { return <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={fieldClass} /></label>; }
function SelectInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}><option value="">Using default visibility</option><option value="true">Searchable</option><option value="false">Hidden from search</option></select></label>; }
function MetricCard({ label, value, trend, negative = false }: { label: string; value: string; trend: string; negative?: boolean }) { return <div className="rounded-[24px] border border-white/10 bg-[#10141b] p-4"><p className="text-xs font-black uppercase tracking-[0.15em] text-white/35">{label}</p><div className="mt-3 flex items-end justify-between"><p className="text-3xl font-black">{value}</p><p className={`text-xs font-black ${negative ? "text-red-300" : "text-emerald-300"}`}>{trend}</p></div><MiniSparkline /></div>; }
function MiniSparkline() { return <svg className="mt-4 h-8 w-full" viewBox="0 0 120 28" preserveAspectRatio="none"><path d="M0 20 L10 12 L20 16 L30 9 L40 14 L50 7 L60 12 L70 8 L80 15 L90 10 L100 13 L110 6 L120 9" fill="none" stroke="#ff2142" strokeWidth="2"/><path d="M0 28 L0 20 L10 12 L20 16 L30 9 L40 14 L50 7 L60 12 L70 8 L80 15 L90 10 L100 13 L110 6 L120 9 L120 28 Z" fill="rgba(255,33,66,.12)"/></svg>; }
function ProgressRing({ value, label = "Complete", compact = false }: { value: number; label?: string; compact?: boolean }) { const safe = Math.max(0, Math.min(100, value)); return <div className={`grid shrink-0 place-items-center rounded-full border-[10px] border-[#ff2142] bg-black/30 ${compact ? "h-24 w-24" : "h-40 w-40"}`} style={{ boxShadow: "inset 0 0 0 10px rgba(255,255,255,.06)" }}><div className="text-center"><p className={compact ? "text-2xl font-black" : "text-4xl font-black"}>{safe}%</p><p className="mt-1 text-[10px] font-black uppercase tracking-widest text-white/45">{label}</p></div></div>; }
function ScoreRow({ label, value }: { label: string; value: number }) { return <div><div className="flex justify-between"><span>{label}</span><span>{value}%</span></div><div className="mt-2 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-[#e1062a] to-emerald-300" style={{ width: `${Math.max(5, Math.min(100, value))}%` }} /></div></div>; }
function StackedRows({ rows }: { rows: Array<[string, string, string]> }) { return <div className="grid gap-2">{rows.map(([label, value, trend]) => <div key={label} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><span className="text-sm font-bold text-white/60">{label}</span><span className="text-right text-sm font-black text-white">{value} {trend ? <span className={trend.includes("▼") ? "ml-2 text-red-300" : "ml-2 text-emerald-300"}>{trend}</span> : null}</span></div>)}</div>; }
function ActivityList() { return <StackedRows rows={[["Menu item updated", "2m ago", ""], ["Hours updated", "1h ago", ""], ["Photo added", "3h ago", ""], ["Description updated", "5h ago", ""]]} />; }
function Checklist({ form, selectTab }: { form: FormState; selectTab: (sectionId: CleanEditorSectionId) => void }) { return <div className="grid gap-3"><ChecklistItem label="Add more photos" ok={Boolean(form.main_image || form.image_url)} action="Add Photos" onClick={() => selectTab("photos")} /><ChecklistItem label="Complete menu categories" ok={Boolean(form.tags)} action="Update Menu" onClick={() => selectTab("menu")} /><ChecklistItem label="Add special hours" ok={Boolean(form.hours || form.operating_hours)} action="Add Hours" onClick={() => selectTab("hours")} /><ChecklistItem label="Enable additional services" ok={Boolean(form.website)} action="Manage" onClick={() => selectTab("public-profile")} /></div>; }
function ChecklistItem({ label, ok, action, onClick }: { label: string; ok: boolean; action: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left transition hover:bg-white/[0.06]"><span className="text-sm font-bold text-white/65"><span className={ok ? "text-emerald-300" : "text-[#ff2142]"}>{ok ? "●" : "○"}</span> {label}</span><span className="rounded-xl border border-white/10 px-3 py-1 text-xs font-black text-white/70">{action}</span></button>; }
function ActionRows({ selectTab }: { selectTab: (sectionId: CleanEditorSectionId) => void }) { const rows: Array<[string, CleanEditorSectionId]> = [["Edit Basic Information", "details"], ["Manage Photos & Media", "photos"], ["Update Hours", "hours"], ["Manage Menu", "menu"], ["View Analytics", "analytics"]]; return <div className="grid gap-2">{rows.map(([label, sectionId]) => <button type="button" key={label} onClick={() => selectTab(sectionId)} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm font-bold text-white/65 transition hover:bg-white/[0.06] hover:text-white"><span>{label}</span><span>→</span></button>)}</div>; }
function MediaBox({ src, alt, className = "" }: { src?: string; alt: string; className?: string }) { return src ? <Image src={src} alt={alt} width={900} height={520} className={`w-full rounded-2xl object-cover ${className}`} unoptimized /> : <div className={`grid place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.03] text-sm font-black text-white/30 ${className || "h-44"}`}>No image set</div>; }
function ChipCloud({ values }: { values: string[] }) { return <div className="mt-4 flex flex-wrap gap-2">{values.slice(0, 10).map((value) => <span key={value} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-black text-white/65">{value}</span>)}</div>; }
function StatusPill({ children }: { children: ReactNode }) { return <span className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-200">{children}</span>; }
function MiniStatus({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/35">{label}</p><p className="mt-1 text-sm font-black text-emerald-200">{value}</p></div>; }
function TagEditor({ label, value, onChange, fallback }: { label: string; value: string; onChange: (value: string) => void; fallback: string[] }) { const chips = splitTags(value, fallback); return <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{label}</p><ChipCloud values={chips} /></div><input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Comma-separated" className={`${fieldClass} lg:max-w-md`} /></div></div>; }
function EmptyState({ title, description }: { title: string; description: string }) { return <div className="rounded-3xl border border-dashed border-white/15 bg-black/25 p-8 text-center"><h3 className="text-2xl font-black">{title}</h3><p className="mt-2 text-sm font-semibold text-white/45">{description}</p></div>; }
function ChecklistMini({ label, ok }: { label: string; ok: boolean }) { return <p className="flex items-center justify-between gap-2 text-xs font-bold text-white/60"><span>{label}</span><span className={ok ? "text-emerald-300" : "text-[#ff2142]"}>{ok ? "●" : "○"}</span></p>; }
function MiniMetric({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-black uppercase tracking-wide text-white/35">{label}</p><p className="mt-1 font-black text-white">{value}</p><p className="text-white/30">Live</p></div>; }
function num(value: unknown) { const n = Number(value || 0); return Number.isFinite(n) ? n : 0; }
function formatMetric(value: unknown) { const n = num(value); return n.toLocaleString(); }
function ReadOnlyInput({ label, value, help }: { label: string; value: string; help?: string }) { return <div className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{label}</span><div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-bold text-white/55">{value}</div>{help ? <p className="text-xs font-semibold text-white/35">{help}</p> : null}</div>; }
