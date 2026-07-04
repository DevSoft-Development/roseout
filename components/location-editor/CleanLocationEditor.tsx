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
import { cleanEditorHashNav, getCleanEditorActions } from "./editor-config";

type FormState = {
  name: string; description: string; phone: string; website: string; address: string; city: string; state: string; zip_code: string; neighborhood: string;
  main_image: string; image_url: string; images: string[]; hours: string; operating_hours?: unknown; is_searchable: string; data_status: string;
  cuisine: string; activity_type: string; price_range: string; primary_tag: string; primary_category: string; category: string; tags: string; semantic_tags: string; best_for_tags: string; best_for: string; vibe_tags: string; date_style_tags: string; intent_tags: string; special_features: string; search_keywords: string; short_description: string; borough: string; latitude: string | number; longitude: string | number; google_place_id: string; formatted_address: string;
};

const fieldClass = "w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-[#e1062a]/70 focus:ring-4 focus:ring-[#e1062a]/10";
const secondaryButtonClass = "inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-wide text-white/70 transition hover:bg-white/[0.08] hover:text-white";

function normalizeLocationTypeParam(value: string): LocationType | null {
  if (value === "restaurants" || value === "restaurant") return "restaurants";
  if (value === "activities" || value === "activity" || value === "activitys") return "activities";
  return null;
}
function serializeForm(form: FormState) { return JSON.stringify(form); }
function toArray(value: string) { const seen = new Set<string>(); const out: string[] = []; for (const item of String(value || "").split(",")) { const clean = item.trim().replace(/\s+/g, " "); const key = clean.toLowerCase(); if (clean && !seen.has(key)) { seen.add(key); out.push(clean); } } return out; }
function publicStatusLabel(form: FormState) {
  if (String(form.data_status || "").toLowerCase().includes("review")) return "Needs Review";
  if (form.is_searchable === "false") return "Hidden";
  if (["approved", "active", "published", "complete"].some((term) => String(form.data_status || "").toLowerCase().includes(term))) return "Published";
  return "Draft";
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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isAdminContext, setIsAdminContext] = useState(false);
  const [canonicalId, setCanonicalId] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [effectiveId, setEffectiveId] = useState(locationId);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [form, setForm] = useState<FormState>({ name: "", description: "", phone: "", website: "", address: "", city: "", state: "", zip_code: "", neighborhood: "", main_image: "", image_url: "", images: [], hours: "", operating_hours: null, is_searchable: "", data_status: "", cuisine: "", activity_type: "", price_range: "", primary_tag: "", primary_category: "", category: "", tags: "", semantic_tags: "", best_for_tags: "", best_for: "", vibe_tags: "", date_style_tags: "", intent_tags: "", special_features: "", search_keywords: "", short_description: "", borough: "", latitude: "", longitude: "", google_place_id: "", formatted_address: "" });

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
  const cancelHref = isDemoMode ? links.dashboard : from;
  const hasUnsavedChanges = savedSnapshot !== "" && serializeForm(form) !== savedSnapshot;
  const mainImage = form.main_image || form.image_url || "";
  const galleryImages = Array.from(new Set([mainImage, ...form.images].filter(Boolean)));
  const score = useMemo(() => clampScore(getLocationScore(form)), [form]);
  const contextLabel = isDemoMode ? "Demo mode" : isAdminContext || Boolean(adminLocationIdParam) ? "Admin location mode" : "Owner mode";
  const update = (key: keyof FormState, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const setMainImage = (url: string) => setForm((prev) => ({ ...prev, main_image: url, image_url: url, images: Array.from(new Set([...prev.images, url])).filter(Boolean) }));

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

  return <main className="min-h-screen bg-[#050607] text-white"><LocationEditorNav links={links} /><section className="min-h-screen lg:pl-[280px]"><header className="sticky top-0 z-20 border-b border-white/10 bg-[#050607]/95 backdrop-blur-xl"><div className="flex flex-col gap-4 px-4 py-4 md:px-6 xl:flex-row xl:items-center xl:justify-between"><div className="flex min-w-0 items-center gap-4"><LocationEditorMobileNav links={links} /><div className="min-w-0"><p className="truncate text-xs font-black uppercase tracking-[0.22em] text-white/40">Locations &gt; {type === "restaurants" ? "Restaurants" : "Activities"} &gt; {form.name || "Location"}</p><div className="mt-1 flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black tracking-tight md:text-3xl">Location Editor</h1><span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white/65">{contextLabel}</span></div><p className="mt-1 text-sm font-semibold text-white/45">A fresh, focused editor shell for location details and public profile settings.</p></div></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => router.push(cancelHref)} className={secondaryButtonClass}>Cancel</button><Link href={links.publicPage} className={secondaryButtonClass}>Public Preview</Link><button type="button" onClick={saveLocation} disabled={saving} className="rounded-full bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-[#ff1654]/25 transition hover:bg-[#ff2142] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button><span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black uppercase tracking-wide text-white/45">{hasUnsavedChanges ? "Draft changes" : "All changes saved"}</span></div></div><div className="flex gap-2 overflow-x-auto px-4 pb-4 md:px-6">{cleanEditorHashNav.map((tab) => <Link key={tab.href} href={tab.href} className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/55 transition hover:bg-white/[0.08] hover:text-white">{tab.label}</Link>)}</div></header><div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6 md:px-6 xl:grid-cols-[minmax(0,1fr)_360px]"> <div className="space-y-6">{message ? <div className="rounded-[24px] border border-white/10 bg-white/[0.06] p-4 text-sm font-bold text-white">{message}</div> : null}<EditorSection id="details" title="Location Details" description="Core identity, category, contact, and address details."><FieldRow><TextInput label="Location Name" value={form.name} onChange={(v) => update("name", v)} /><TextInput label={type === "restaurants" ? "Cuisine" : "Activity Type"} value={type === "restaurants" ? form.cuisine : form.activity_type} onChange={(v) => update(type === "restaurants" ? "cuisine" : "activity_type", v)} /></FieldRow><FieldRow><TextInput label="Phone" value={form.phone} onChange={(v) => update("phone", v)} /><TextInput label="Website" value={form.website} onChange={(v) => update("website", v)} /></FieldRow><FieldRow><TextInput label="Price Tier" value={form.price_range} onChange={(v) => update("price_range", v)} /><TextInput label="Primary Tag" value={form.primary_tag} onChange={(v) => update("primary_tag", v)} /></FieldRow><TextArea label="Description" value={form.description} onChange={(v) => update("description", v)} /><FieldRow><TextInput label="Address" value={form.address} onChange={(v) => update("address", v)} /><TextInput label="City" value={form.city} onChange={(v) => update("city", v)} /></FieldRow><FieldRow><TextInput label="State" value={form.state} onChange={(v) => update("state", v)} /><TextInput label="Zip" value={form.zip_code} onChange={(v) => update("zip_code", v)} /></FieldRow></EditorSection><EditorSection id="public-profile" title="Public Profile" description="Search visibility and public publishing status."><FieldRow><SelectInput label="Search Visibility" value={form.is_searchable} onChange={(v) => update("is_searchable", v)} /><TextInput label="Data Status" value={form.data_status} onChange={(v) => update("data_status", v)} /></FieldRow><ReadOnly label="Public Status" value={publicStatusLabel(form)} /></EditorSection><EditorSection id="search-enhancements" title="Search Result Enhancements" description="Owner-safe discovery fields used by TheOutHaven search and recommendations."><LocationEditorAiRecommendations context={editorContext} form={form} targetSection="search-enhancements" onApply={(patch) => setForm((prev) => ({ ...prev, ...patch }))} /><FieldRow><TextInput label="Primary Tag" value={form.primary_tag} onChange={(v) => update("primary_tag", v)} /><TextInput label="Primary Category" value={form.primary_category} onChange={(v) => update("primary_category", v)} /></FieldRow><FieldRow><TextInput label="Cuisine / Activity Type" value={type === "restaurants" ? form.cuisine : form.activity_type} onChange={(v) => update(type === "restaurants" ? "cuisine" : "activity_type", v)} /><TextInput label="Category" value={form.category} onChange={(v) => update("category", v)} /></FieldRow><FieldRow><TextInput label="Neighborhood" value={form.neighborhood} onChange={(v) => update("neighborhood", v)} /><TextInput label="Borough" value={form.borough} onChange={(v) => update("borough", v)} /></FieldRow><FieldRow><TextInput label="Price Range" value={form.price_range} onChange={(v) => update("price_range", v)} /><TextInput label="Tags" value={form.tags} onChange={(v) => update("tags", v)} placeholder="Comma-separated" /></FieldRow><TextArea label="Short Description" value={form.short_description} onChange={(v) => update("short_description", v)} /><TextArea label="Description" value={form.description} onChange={(v) => update("description", v)} /><TextArea label="Search Keywords" value={form.search_keywords} onChange={(v) => update("search_keywords", v)} /><FieldRow><TextInput label="Vibe Tags" value={form.vibe_tags} onChange={(v) => update("vibe_tags", v)} /><TextInput label="Best For Tags" value={form.best_for_tags} onChange={(v) => update("best_for_tags", v)} /></FieldRow><FieldRow><TextInput label="Date Style Tags" value={form.date_style_tags} onChange={(v) => update("date_style_tags", v)} /><TextInput label="Intent Tags" value={form.intent_tags} onChange={(v) => update("intent_tags", v)} /></FieldRow><TextArea label="Special Features" value={form.special_features} onChange={(v) => update("special_features", v)} /></EditorSection><EditorSection id="photos" title="Photos" description="Primary image and existing gallery URLs."><TextInput label="Primary Image URL" value={mainImage} onChange={setMainImage} />{mainImage ? <Image src={mainImage} alt="Primary location preview" width={900} height={360} className="h-52 w-full rounded-2xl object-cover" unoptimized /> : <div className="grid h-52 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-sm font-bold text-white/35">No primary image set</div>}<div className="grid gap-3 sm:grid-cols-3">{galleryImages.slice(0, 6).map((image) => <button type="button" key={image} onClick={() => setMainImage(image)} className="overflow-hidden rounded-2xl border border-white/10 text-left"><Image src={image} alt="Gallery image" width={260} height={160} className="h-24 w-full object-cover" unoptimized /><span className="block px-3 py-2 text-xs font-bold text-white/60">Set as main</span></button>)}</div></EditorSection><EditorSection id="hours" title="Weekly Hours" description="Edit open and closed times without raw JSON."><LocationEditorHoursPanel value={form.operating_hours} importedHours={(form as any).google_regular_opening_hours} isAdmin={isAdminContext} onChange={(operatingHours, summary) => setForm((prev) => ({ ...prev, operating_hours: operatingHours, hours: summary }))} /></EditorSection><EditorSection id="menu" title="Menu" description="Create, edit, preview, and publish this selected location menu without leaving the editor."><LocationEditorMenuPanel context={editorContext} returnHref={links.edit} /></EditorSection><EditorSection id="qr-codes" title="QR Codes" description="Generate, repair, view, copy, print, and download location-scoped QR codes."><LocationEditorQrPanel context={editorContext} links={links} /></EditorSection><EditorSection id="analytics" title="Analytics" description="Location-scoped performance and conversion metrics for this profile."><LocationEditorAnalyticsPanel context={editorContext} /></EditorSection><EditorSection id="marketing-center" title="Marketing Center" description="Create location-scoped marketing drafts and open existing Growth Pro tools."><LocationEditorMarketingPanel context={editorContext} form={form} /></EditorSection></div><aside className="space-y-6 xl:sticky xl:top-[150px] xl:self-start"><section className="rounded-[24px] border border-white/10 bg-[#10141b] p-5"><p className="text-xs font-black uppercase tracking-[0.22em] text-[#ff9bb6]">Quick Actions</p><div className="mt-4 grid gap-2">{getCleanEditorActions(links, isAdminContext || isDemoMode).map((item) => <Link key={item.label} href={item.href} className={secondaryButtonClass}>{item.label}</Link>)}</div></section><section className="rounded-[24px] border border-white/10 bg-[#10141b] p-5"><p className="text-xs font-black uppercase tracking-[0.22em] text-[#ff9bb6]">Preview</p><h2 className="mt-2 text-2xl font-black">{form.name || "Location Name"}</h2><p className="mt-3 text-sm leading-6 text-white/55">{form.description || "Public description will appear here."}</p><p className="mt-3 text-sm font-semibold text-white/60">{formatFullAddress({ address: form.address, city: form.city, state: form.state, zip_code: form.zip_code, fallback: "Address not set" })}</p><ReadOnly label="TheOutHaven Score" value={`${score}/100`} /></section></aside></div></section></main>;
}

function EditorSection({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) { return <section id={id} className="scroll-mt-28 rounded-[28px] border border-white/10 bg-[#0c1017] shadow-[0_24px_80px_rgba(0,0,0,0.35)]"><div className="border-b border-white/10 px-6 py-5"><h2 className="text-lg font-black">{title}</h2><p className="mt-1 text-sm leading-6 text-white/55">{description}</p></div><div className="grid gap-4 p-5 md:p-6">{children}</div></section>; }
function FieldRow({ children }: { children: ReactNode }) { return <div className="grid gap-4 md:grid-cols-2">{children}</div>; }
function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={fieldClass} /></label>; }
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} className={fieldClass} /></label>; }
function SelectInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}><option value="">Using default visibility</option><option value="true">Searchable</option><option value="false">Hidden from search</option></select></label>; }
function ReadOnly({ label, value }: { label: string; value: string }) { return <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">{label}</p><p className="mt-1 text-sm font-black text-white">{value}</p></div>; }
