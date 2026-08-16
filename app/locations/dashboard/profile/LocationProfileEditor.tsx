"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Clock3,
  Eye,
  Globe2,
  ImageIcon,
  MapPin,
  Phone,
  Save,
  Search,
} from "lucide-react";

type LocationType = "restaurants" | "activities";

type ProfileForm = {
  name: string;
  short_description: string;
  description: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  neighborhood: string;
  cuisine: string;
  activity_type: string;
  category: string;
  price_range: string;
  main_image: string;
  image_url: string;
  hours: string;
  is_searchable: boolean;
};

const emptyForm: ProfileForm = {
  name: "",
  short_description: "",
  description: "",
  phone: "",
  website: "",
  address: "",
  city: "",
  state: "",
  zip_code: "",
  neighborhood: "",
  cuisine: "",
  activity_type: "",
  category: "",
  price_range: "",
  main_image: "",
  image_url: "",
  hours: "",
  is_searchable: true,
};

const inputClass =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/25 focus:border-[#ff2142]/60 focus:ring-4 focus:ring-[#e1062a]/10";

function cleanType(type: LocationType) {
  return type === "activities" ? "activity" : "restaurant";
}

export default function LocationProfileEditor({
  locationId,
  locationType,
  demoMode,
}: {
  locationId: string;
  locationType: LocationType;
  demoMode?: boolean;
}) {
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [canonicalId, setCanonicalId] = useState(locationId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setMessage("");
      try {
        const response = await fetch(
          `/api/locations/edit-context?type=${locationType}&id=${encodeURIComponent(locationId)}`,
          { cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok || !result.location) {
          throw new Error(result.error || "We could not load this profile.");
        }
        const data = result.location;
        const next: ProfileForm = {
          name:
            data.name ||
            data.restaurant_name ||
            data.activity_name ||
            "",
          short_description: data.short_description || "",
          description: data.description || "",
          phone: data.phone || "",
          website: data.website || data.website_url || "",
          address: data.address || "",
          city: data.city || "",
          state: data.state || "",
          zip_code: data.zip_code || data.postal_code || "",
          neighborhood: data.neighborhood || "",
          cuisine: data.cuisine || data.cuisine_type || "",
          activity_type: data.activity_type || "",
          category: data.category || data.primary_category || "",
          price_range: data.price_range || "",
          main_image: data.main_image || data.image_url || "",
          image_url: data.image_url || data.main_image || "",
          hours: typeof data.hours === "string" ? data.hours : "",
          is_searchable: data.is_searchable !== false,
        };
        if (cancelled) return;
        setCanonicalId(String(result.canonicalId || result.effectiveId || locationId));
        setForm(next);
        setSavedSnapshot(JSON.stringify(next));
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "We could not load this profile.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [locationId, locationType]);

  const update = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const completion = useMemo(() => {
    const checks = [
      form.name,
      form.phone,
      form.website,
      form.address,
      form.city,
      form.state,
      form.short_description || form.description,
      form.main_image || form.image_url,
      form.cuisine || form.activity_type || form.category,
      form.hours,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [form]);

  const hasChanges = savedSnapshot !== "" && savedSnapshot !== JSON.stringify(form);
  const image = form.main_image || form.image_url;
  const publicHref = `/locations/${cleanType(locationType)}/${encodeURIComponent(canonicalId || locationId)}`;
  const advancedHref = `/locations/${locationType}/${encodeURIComponent(canonicalId || locationId)}/edit?from=/locations/dashboard/profile`;

  async function save() {
    setSaving(true);
    setMessage("");
    const nameField = locationType === "activities" ? "activity_name" : "restaurant_name";
    const payload: Record<string, unknown> = {
      name: form.name,
      [nameField]: form.name,
      short_description: form.short_description,
      description: form.description,
      phone: form.phone,
      website: form.website,
      address: form.address,
      city: form.city,
      state: form.state,
      zip_code: form.zip_code,
      neighborhood: form.neighborhood,
      category: form.category,
      price_range: form.price_range,
      main_image: form.main_image || form.image_url || null,
      image_url: form.image_url || form.main_image || null,
      hours: form.hours,
      is_searchable: form.is_searchable,
    };
    if (locationType === "restaurants") payload.cuisine = form.cuisine;
    if (locationType === "activities") payload.activity_type = form.activity_type;

    try {
      const response = await fetch("/api/locations/edit-context", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: locationType,
          id: canonicalId || locationId,
          payload,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We could not save your profile.");
      if (result.canonicalId) setCanonicalId(String(result.canonicalId));
      setSavedSnapshot(JSON.stringify(form));
      setMessage("Your business profile was saved successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050607] p-6 text-white">
        <div className="mx-auto max-w-5xl animate-pulse rounded-3xl border border-white/10 bg-white/[0.04] p-8">
          <div className="h-5 w-40 rounded bg-white/10" />
          <div className="mt-4 h-10 w-80 max-w-full rounded bg-white/10" />
          <div className="mt-8 h-64 rounded-3xl bg-white/5" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] text-white">
      <div className="sticky top-0 z-30 border-b border-white/10 bg-[#050607]/95 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">Business Profile</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">Keep your customer-facing information current</h1>
            <p className="mt-1 max-w-2xl text-sm font-semibold text-white/45">
              Update the information guests use to understand, find, and contact your location.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={publicHref} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-black text-white/75 hover:bg-white/[0.08]">
              Preview profile
            </Link>
            <button
              type="button"
              onClick={save}
              disabled={saving || !hasChanges}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-5 py-2.5 text-sm font-black shadow-lg shadow-[#ff1654]/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save size={16} /> {saving ? "Saving..." : hasChanges ? "Save changes" : "Saved"}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {demoMode ? (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-100">
            Demo mode is active. Changes affect the demo location only.
          </div>
        ) : null}

        {message ? (
          <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${message.toLowerCase().includes("success") ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-white/[0.05] text-white/75"}`}>
            {message}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e1062a]/15 text-[#ff6b86]">
                <Building2 size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black">Profile essentials</h2>
                <p className="mt-1 text-sm font-semibold text-white/45">Start here. These are the fields guests notice most.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Business name" value={form.name} onChange={(value) => update("name", value)} placeholder="Your business name" />
              <Field
                label={locationType === "restaurants" ? "Cuisine" : "Activity type"}
                value={locationType === "restaurants" ? form.cuisine : form.activity_type}
                onChange={(value) => update(locationType === "restaurants" ? "cuisine" : "activity_type", value)}
                placeholder={locationType === "restaurants" ? "Italian, Caribbean, Steakhouse..." : "Bowling, pottery, escape room..."}
              />
              <Field label="Category" value={form.category} onChange={(value) => update("category", value)} placeholder="Optional category" />
              <PriceField value={form.price_range} onChange={(value) => update("price_range", value)} />
            </div>
            <div className="mt-4">
              <Field label="Short description" value={form.short_description} onChange={(value) => update("short_description", value)} placeholder="A quick sentence that tells guests what makes your location special" maxLength={180} />
              <p className="mt-2 text-right text-xs font-bold text-white/30">{form.short_description.length}/180</p>
            </div>
            <div className="mt-4">
              <TextArea label="Full description" value={form.description} onChange={(value) => update("description", value)} placeholder="Tell guests what to expect, what you are known for, and what kind of experience you offer." />
            </div>
          </div>

          <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Profile strength</p>
            <p className="mt-3 text-4xl font-black">{completion}%</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#ff2142]" style={{ width: `${completion}%` }} /></div>
            <p className="mt-4 text-sm font-semibold leading-6 text-white/45">
              Complete the basics, contact info, image, and hours so guests have fewer reasons to leave your profile.
            </p>
            <div className="mt-5 space-y-2 text-sm font-bold text-white/65">
              <Check label="Business name" done={Boolean(form.name)} />
              <Check label="Contact details" done={Boolean(form.phone || form.website)} />
              <Check label="Address" done={Boolean(form.address && form.city)} />
              <Check label="Description" done={Boolean(form.short_description || form.description)} />
              <Check label="Photo" done={Boolean(image)} />
              <Check label="Hours" done={Boolean(form.hours)} />
            </div>
          </aside>
        </section>

        <Section icon={<Phone size={20} />} title="Contact information" description="Make it easy for guests to call or visit your website.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Phone" value={form.phone} onChange={(value) => update("phone", value)} placeholder="(555) 555-5555" />
            <Field label="Website" value={form.website} onChange={(value) => update("website", value)} placeholder="https://yourwebsite.com" />
          </div>
        </Section>

        <Section icon={<MapPin size={20} />} title="Location" description="This address is used for directions and local discovery.">
          <Field label="Street address" value={form.address} onChange={(value) => update("address", value)} placeholder="123 Main Street" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="City" value={form.city} onChange={(value) => update("city", value)} placeholder="City" />
            <Field label="State" value={form.state} onChange={(value) => update("state", value)} placeholder="NY" />
            <Field label="ZIP code" value={form.zip_code} onChange={(value) => update("zip_code", value)} placeholder="10001" />
            <Field label="Neighborhood" value={form.neighborhood} onChange={(value) => update("neighborhood", value)} placeholder="Optional" />
          </div>
        </Section>

        <Section icon={<ImageIcon size={20} />} title="Main photo" description="Choose the image guests should see first on your profile.">
          <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/25">
              {image ? <Image src={image} alt={form.name || "Business profile"} width={720} height={480} className="h-44 w-full object-cover" unoptimized /> : <div className="grid h-44 place-items-center text-white/25"><ImageIcon size={42} /></div>}
            </div>
            <div>
              <Field label="Image URL" value={image} onChange={(value) => { update("main_image", value); update("image_url", value); }} placeholder="https://..." />
              <p className="mt-2 text-xs font-semibold leading-5 text-white/35">
                This uses the profile photo already stored for your location. For multiple photos and advanced media controls, use the full location editor.
              </p>
              <Link href={`${advancedHref}#photos`} className="mt-3 inline-flex rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-white/65 hover:bg-white/[0.06]">Open photo manager</Link>
            </div>
          </div>
        </Section>

        <Section icon={<Clock3 size={20} />} title="Hours" description="Give guests a simple public hours summary.">
          <TextArea label="Business hours" value={form.hours} onChange={(value) => update("hours", value)} placeholder="Example: Mon–Thu 5 PM–10 PM, Fri–Sat 5 PM–12 AM, Sun 4 PM–9 PM" rows={3} />
          <Link href={`${advancedHref}#hours`} className="mt-3 inline-flex rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-white/65 hover:bg-white/[0.06]">Open structured hours editor</Link>
        </Section>

        <Section icon={<Eye size={20} />} title="Visibility" description="Control whether this location can appear in TheOutHaven discovery.">
          <button type="button" onClick={() => update("is_searchable", !form.is_searchable)} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-left">
            <div>
              <p className="font-black">Show this location in search</p>
              <p className="mt-1 text-sm font-semibold text-white/40">Turn this off only if the location should temporarily stop appearing in discovery.</p>
            </div>
            <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${form.is_searchable ? "bg-[#e1062a]" : "bg-white/15"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${form.is_searchable ? "left-6" : "left-1"}`} /></span>
          </button>
        </Section>

        <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black"><Search size={16} className="text-[#ff6b86]" /> Need more control?</div>
            <p className="mt-1 text-sm font-semibold text-white/40">Advanced search tags, analytics, QR tools, and power editing remain available without cluttering this page.</p>
          </div>
          <Link href={advancedHref} className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-black text-white/75 hover:bg-white/[0.08]">Advanced editor</Link>
        </section>

        <div className="flex justify-end pb-8">
          <button type="button" onClick={save} disabled={saving || !hasChanges} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-6 py-3 text-sm font-black shadow-lg shadow-[#ff1654]/20 disabled:cursor-not-allowed disabled:opacity-40"><Save size={16} />{saving ? "Saving..." : hasChanges ? "Save changes" : "Everything is saved"}</button>
        </div>
      </div>
    </main>
  );
}

function Section({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6"><div className="mb-5 flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#e1062a]/15 text-[#ff6b86]">{icon}</span><div><h2 className="text-lg font-black">{title}</h2><p className="mt-1 text-sm font-semibold text-white/40">{description}</p></div></div>{children}</section>;
}

function Field({ label, value, onChange, placeholder, maxLength }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength?: number }) {
  return <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-white/45">{label}</span><input className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} /></label>;
}

function TextArea({ label, value, onChange, placeholder, rows = 5 }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; rows?: number }) {
  return <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-white/45">{label}</span><textarea className={`${inputClass} resize-y`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={rows} /></label>;
}

function PriceField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div><span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-white/45">Price range</span><div className="grid grid-cols-4 gap-2">{["$", "$$", "$$$", "$$$$"].map((price) => <button key={price} type="button" onClick={() => onChange(price)} className={`rounded-2xl border px-2 py-3 text-sm font-black transition ${value === price ? "border-[#ff2142]/60 bg-[#e1062a]/20 text-white" : "border-white/10 bg-black/25 text-white/45 hover:bg-white/[0.05]"}`}>{price}</button>)}</div></div>;
}

function Check({ label, done }: { label: string; done: boolean }) {
  return <div className="flex items-center gap-2"><CheckCircle2 size={15} className={done ? "text-emerald-300" : "text-white/20"} /><span className={done ? "text-white/70" : "text-white/35"}>{label}</span></div>;
}
