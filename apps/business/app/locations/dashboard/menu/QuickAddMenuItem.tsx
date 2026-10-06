"use client";

import { useMemo, useState } from "react";

const fieldBase = "w-full rounded-2xl border bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/30 focus:ring-4";
const fieldClass = `${fieldBase} border-white/10 focus:border-[#ff2142]/60 focus:ring-[#ff2142]/10`;
const fieldErrorClass = `${fieldBase} border-red-400/70 focus:border-red-400 focus:ring-red-400/10`;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxImageBytes = 8 * 1024 * 1024;

const steps = [
  ["type", "What are you adding?"],
  ["details", "Basic details"],
  ["setup", "How does it work?"],
  ["options", "Options"],
  ["channels", "Where should it appear?"],
  ["pos", "POS & operations"],
  ["review", "Review & save"],
] as const;

const itemTypes = [
  { value: "food_beverage", label: "Food or drink", help: "Meals, snacks, cocktails, soft drinks, desserts, and similar items." },
  { value: "retail", label: "Retail item", help: "Merchandise or products guests can buy." },
  { value: "service", label: "Service", help: "A service performed for a guest." },
  { value: "timed_resource", label: "Timed activity", help: "Bowling lane, karaoke room, golf bay, pool table, or another timed resource." },
  { value: "admission_experience", label: "Experience or admission", help: "Sip-and-paint, classes, tickets, attractions, and experiences." },
  { value: "rental", label: "Rental", help: "Shoes, equipment, rooms, or other rented items." },
  { value: "package_bundle", label: "Package", help: "Birthday packages, bundles, combos, and grouped offers." },
  { value: "fee_deposit", label: "Fee or deposit", help: "Deposits, service fees, cancellation fees, and similar charges." },
] as const;

const channelOptions = [
  ["website", "Website", "Show this item on the location website."],
  ["profile", "TheOutHaven profile", "Show this item on the public TheOutHaven profile."],
  ["pos", "POS", "Make this item available to staff in ThePOSHaven."],
  ["reserve", "Reservations", "Make this item available as part of booking flows."],
  ["online_ordering", "Online ordering", "Allow this item in future online ordering."],
  ["qr_ordering", "QR ordering", "Allow this item in future QR ordering."],
  ["kiosk", "Kiosk", "Allow this item in future self-service kiosk flows."],
] as const;

type Props = {
  locationId: string;
  sections: any[];
  items: any[];
  contextKey: "locationId" | "adminLocationId" | "demoLocationId";
  contextPayload: Record<string, unknown>;
};

type ChannelKey = (typeof channelOptions)[number][0];

type Draft = {
  item_type: string;
  name: string;
  price: string;
  description: string;
  image_url: string;
  section_id: string;
  new_section: string;
  duration_minutes: string;
  capacity: string;
  resource_type: string;
  requires_booking: boolean;
  requires_waiver: boolean;
  minimum_age: string;
  deposit: string;
  tags: string;
  is_available: boolean;
  is_featured: boolean;
  channels: Record<ChannelKey, boolean>;
  pos_short_name: string;
  sku: string;
  tax_category: string;
  revenue_category: string;
  prep_station: string;
};

function sectionName(section: any) {
  return String(section?.title || section?.name || "Uncategorized");
}

function itemPrice(item: any) {
  if (item?.price_label) return String(item.price_label);
  if (item?.price) return String(item.price);
  if (item?.price_cents != null) return `$${(Number(item.price_cents) / 100).toFixed(2)}`;
  return "Price not set";
}

function editablePrice(item: any) {
  if (item?.price_cents != null) return (Number(item.price_cents) / 100).toFixed(2);
  const label = String(item?.price_label || item?.price || "").replace(/[$,]/g, "").trim();
  return /^\d+(\.\d{1,2})?$/.test(label) ? label : "";
}

function moneyFromCents(value: unknown) {
  if (value == null || value === "") return "";
  const cents = Number(value);
  return Number.isFinite(cents) ? (cents / 100).toFixed(2) : "";
}

function priceError(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^\$?\d+(\.\d{0,2})?$/.test(trimmed.replace(/,/g, ""))) return "Use a valid price such as 14 or 14.99.";
  const numeric = Number(trimmed.replace(/[$,]/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return "Price cannot be negative.";
  return "";
}

function defaultChannels() {
  return {
    website: true,
    profile: true,
    pos: true,
    reserve: false,
    online_ordering: false,
    qr_ordering: false,
    kiosk: false,
  };
}

function blankDraft(sections: any[]): Draft {
  return {
    item_type: "food_beverage",
    name: "",
    price: "",
    description: "",
    image_url: "",
    section_id: sections[0]?.id ? String(sections[0].id) : "__new__",
    new_section: sections.length ? "" : "General",
    duration_minutes: "",
    capacity: "",
    resource_type: "",
    requires_booking: false,
    requires_waiver: false,
    minimum_age: "",
    deposit: "",
    tags: "",
    is_available: true,
    is_featured: false,
    channels: defaultChannels(),
    pos_short_name: "",
    sku: "",
    tax_category: "",
    revenue_category: "",
    prep_station: "",
  };
}

function fromItem(item: any, sections: any[]): Draft {
  const visibility = item?.channel_visibility || {};
  return {
    item_type: String(item?.item_type || "food_beverage"),
    name: String(item?.name || ""),
    price: editablePrice(item),
    description: String(item?.description || ""),
    image_url: String(item?.image_url || ""),
    section_id: item?.section_id ? String(item.section_id) : (sections[0]?.id ? String(sections[0].id) : "__new__"),
    new_section: "",
    duration_minutes: item?.duration_minutes == null ? "" : String(item.duration_minutes),
    capacity: item?.capacity == null ? "" : String(item.capacity),
    resource_type: String(item?.resource_type || ""),
    requires_booking: item?.requires_booking === true,
    requires_waiver: item?.requires_waiver === true,
    minimum_age: item?.minimum_age == null ? "" : String(item.minimum_age),
    deposit: moneyFromCents(item?.deposit_cents),
    tags: Array.isArray(item?.tags) ? item.tags.join(", ") : "",
    is_available: item?.is_available !== false,
    is_featured: item?.is_featured === true,
    channels: {
      website: visibility.website !== false,
      profile: visibility.profile !== false,
      pos: visibility.pos !== false,
      reserve: visibility.reserve === true,
      online_ordering: visibility.online_ordering === true,
      qr_ordering: visibility.qr_ordering === true,
      kiosk: visibility.kiosk === true,
    },
    pos_short_name: String(item?.pos_short_name || ""),
    sku: String(item?.sku || ""),
    tax_category: String(item?.tax_category || ""),
    revenue_category: String(item?.revenue_category || ""),
    prep_station: String(item?.prep_station || ""),
  };
}

function needsTimedSetup(type: string) {
  return ["timed_resource", "admission_experience", "rental", "service"].includes(type);
}

export default function QuickAddMenuItem({ locationId, sections, items, contextKey, contextPayload }: Props) {
  const [editingItemId, setEditingItemId] = useState("");
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => blankDraft(sections));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const editingItem = items.find((item: any) => String(item.id) === editingItemId);
  const sectionById = useMemo(() => new Map(sections.map((section) => [String(section.id), sectionName(section)])), [sections]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function resetForm() {
    setEditingItemId("");
    setStep(0);
    setDraft(blankDraft(sections));
    setMessage("");
  }

  function editItem(item: any) {
    setEditingItemId(String(item.id));
    setDraft(fromItem(item, sections));
    setStep(0);
    setMessage(`Editing ${item.name || "item"}.`);
    requestAnimationFrame(() => document.getElementById("menu-item-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function api(method: string, body: Record<string, unknown>) {
    const res = await fetch("/api/business/menu", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...contextPayload, [contextKey]: locationId, locationId, ...body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || json?.error || "We could not save this item.");
    return json;
  }

  async function upload(file: File | null) {
    if (!file) return;
    setMessage("");
    if (!allowedImageTypes.has(file.type)) return setMessage("Photo format not supported. Use JPG, PNG, WebP, or GIF.");
    if (file.size > maxImageBytes) return setMessage("Photo is too large. Maximum file size is 8 MB.");
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("locationId", locationId);
      form.set(contextKey, locationId);
      for (const [key, value] of Object.entries(contextPayload)) {
        if (value === undefined || value === null) continue;
        form.set(key, String(value));
      }
      const res = await fetch("/api/business/menu/item-image/upload", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) throw new Error(json?.message || json?.error || "Image upload failed.");
      update("image_url", String(json.url));
      setMessage("Photo uploaded.");
    } catch (error: any) {
      setMessage(error?.message || "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function validateStep(index: number) {
    if (index === 1) {
      if (!draft.name.trim()) return "Add an item name before continuing.";
      const priceIssue = priceError(draft.price);
      if (priceIssue) return priceIssue;
      if (draft.section_id === "__new__" && !draft.new_section.trim()) return "Add a category name before continuing.";
    }
    if (index === 2) {
      if (draft.duration_minutes && (!Number.isInteger(Number(draft.duration_minutes)) || Number(draft.duration_minutes) <= 0)) return "Duration must be a whole number greater than 0.";
      if (draft.capacity && (!Number.isInteger(Number(draft.capacity)) || Number(draft.capacity) <= 0)) return "Capacity must be a whole number greater than 0.";
      if (draft.minimum_age && (!Number.isInteger(Number(draft.minimum_age)) || Number(draft.minimum_age) < 0)) return "Minimum age must be a whole number.";
      const depositIssue = priceError(draft.deposit);
      if (depositIssue) return `Deposit: ${depositIssue}`;
    }
    return "";
  }

  function next() {
    const issue = validateStep(step);
    if (issue) return setMessage(issue);
    setMessage("");
    setStep((current) => Math.min(steps.length - 1, current + 1));
  }

  function back() {
    setMessage("");
    setStep((current) => Math.max(0, current - 1));
  }

  async function saveItem() {
    if (saving || uploading) return;
    for (let index = 0; index < steps.length - 1; index += 1) {
      const issue = validateStep(index);
      if (issue) {
        setStep(index);
        setMessage(issue);
        return;
      }
    }

    setSaving(true);
    setMessage("");
    try {
      let targetSectionId = draft.section_id;
      if (targetSectionId === "__new__" || !targetSectionId) {
        const title = draft.new_section.trim();
        const sectionResult = await api("POST", { action: "create_section", title });
        const created = (sectionResult?.data?.sections || sectionResult?.sections || []).find((entry: any) => sectionName(entry).toLowerCase() === title.toLowerCase());
        if (!created?.id) throw new Error("The category was created, but could not be selected. Refresh and try again.");
        targetSectionId = String(created.id);
      }

      const numericPrice = draft.price.trim() ? Number(String(draft.price).replace(/[$,]/g, "").trim()) : 0;
      const numericDeposit = draft.deposit.trim() ? Number(String(draft.deposit).replace(/[$,]/g, "").trim()) : 0;
      const common = {
        section_id: targetSectionId,
        name: draft.name.trim(),
        description: draft.description.trim(),
        price_cents: draft.price.trim() ? Math.round(numericPrice * 100) : null,
        price_label: draft.price.trim() ? `$${numericPrice.toFixed(2)}` : "",
        image_url: draft.image_url,
        tags: draft.tags.split(",").map((value) => value.trim()).filter(Boolean),
        is_available: draft.is_available,
        is_featured: draft.is_featured,
        item_type: draft.item_type,
        duration_minutes: draft.duration_minutes ? Number(draft.duration_minutes) : null,
        capacity: draft.capacity ? Number(draft.capacity) : null,
        resource_type: draft.resource_type.trim(),
        requires_booking: draft.requires_booking,
        requires_waiver: draft.requires_waiver,
        minimum_age: draft.minimum_age ? Number(draft.minimum_age) : null,
        deposit_cents: draft.deposit.trim() ? Math.round(numericDeposit * 100) : null,
        channel_visibility: draft.channels,
        pos_short_name: draft.pos_short_name.trim(),
        sku: draft.sku.trim(),
        tax_category: draft.tax_category.trim(),
        revenue_category: draft.revenue_category.trim(),
        prep_station: draft.prep_station.trim(),
      };

      if (editingItemId) {
        await api("PATCH", { action: "update_item", item_id: editingItemId, ...common });
      } else {
        await api("POST", { action: "create_item", ...common });
      }
      setMessage(editingItemId ? "Item updated. Refreshing your catalog..." : "Item added. Refreshing your catalog...");
      window.location.reload();
    } catch (error: any) {
      setMessage(error?.message || "We could not save this item.");
      setSaving(false);
    }
  }

  const errorMessage = /fix|failed|could not|not supported|too large|must|required|before continuing/i.test(message);
  const typeLabel = itemTypes.find((entry) => entry.value === draft.item_type)?.label || "Item";
  const selectedCategory = draft.section_id === "__new__" ? draft.new_section : sectionById.get(draft.section_id);

  return (
    <section id="menu-item-editor" className="scroll-mt-28 rounded-[2rem] border border-white/10 bg-[#0c1017] p-5 shadow-[0_24px_80px_rgba(0,0,0,.24)] sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#f5b700]">{editingItemId ? "Edit item" : "Add item"}</p>
          <h2 className="mt-1 text-2xl font-black">{editingItemId ? `Update ${editingItem?.name || "item"}` : "Follow the steps"}</h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/55">Everything is shown as part of the guided setup. Nothing important is hidden behind an advanced menu.</p>
        </div>
        <div className="flex items-center gap-2">
          {editingItemId ? <button type="button" onClick={resetForm} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-white/60 hover:bg-white/[0.05]">Cancel edit</button> : null}
          <p className="text-xs font-bold text-white/35">{items.length} saved item{items.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-2">
          {steps.map(([key, label], index) => {
            const active = index === step;
            const complete = index < step;
            return <button key={key} type="button" onClick={() => setStep(index)} className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${active ? "border-[#ff2142]/60 bg-[#ff2142]/15 text-white" : complete ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.03] text-white/40"}`}><span className="grid h-5 w-5 place-items-center rounded-full bg-black/20">{complete ? "✓" : index + 1}</span>{label}</button>;
          })}
        </div>
      </div>

      <div className="mt-5 min-h-[430px] rounded-3xl border border-white/10 bg-black/20 p-5 sm:p-6">
        {step === 0 ? <div>
          <h3 className="text-xl font-black">What are you adding?</h3>
          <p className="mt-1 text-sm font-semibold text-white/45">Choose the closest match. The next steps adapt to it.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {itemTypes.map((entry) => <button key={entry.value} type="button" onClick={() => update("item_type", entry.value)} className={`rounded-2xl border p-4 text-left transition ${draft.item_type === entry.value ? "border-[#ff2142]/60 bg-[#ff2142]/12" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"}`}><p className="font-black">{entry.label}</p><p className="mt-2 text-xs font-semibold leading-5 text-white/40">{entry.help}</p></button>)}
          </div>
        </div> : null}

        {step === 1 ? <div>
          <h3 className="text-xl font-black">Basic details</h3>
          <p className="mt-1 text-sm font-semibold text-white/45">Add what guests and staff need to recognize this item.</p>
          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 sm:col-span-2"><span className="text-xs font-black text-white/60">Item name *</span><input className={!draft.name.trim() && message ? fieldErrorClass : fieldClass} value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder={draft.item_type === "timed_resource" ? "Example: 90-Minute Lane Rental" : draft.item_type === "admission_experience" ? "Example: Friday Sip & Paint" : "Example: Truffle Fries"} /></label>
              <label className="grid gap-1"><span className="text-xs font-black text-white/60">Price</span><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-white/35">$</span><input className={`${fieldClass} pl-8`} inputMode="decimal" value={draft.price} onChange={(event) => update("price", event.target.value)} placeholder="14.00" /></div></label>
              <label className="grid gap-1"><span className="text-xs font-black text-white/60">Category *</span><select className={fieldClass} value={draft.section_id} onChange={(event) => update("section_id", event.target.value)}>{sections.map((section) => <option key={String(section.id)} value={String(section.id)}>{sectionName(section)}</option>)}<option value="__new__">+ Create new category</option></select></label>
              {draft.section_id === "__new__" ? <label className="grid gap-1 sm:col-span-2"><span className="text-xs font-black text-white/60">New category name *</span><input className={fieldClass} value={draft.new_section} onChange={(event) => update("new_section", event.target.value)} placeholder="Example: Cocktails, Packages, Activities" /></label> : null}
              <label className="grid gap-1 sm:col-span-2"><span className="text-xs font-black text-white/60">Description</span><textarea className={fieldClass} rows={4} value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="Describe it in plain language." /></label>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Photo</p>
              {draft.image_url ? <img src={draft.image_url} alt="Item preview" className="mt-3 h-40 w-full rounded-xl object-cover" /> : <div className="mt-3 grid h-40 place-items-center rounded-xl border border-dashed border-white/15 px-6 text-center text-xs font-bold text-white/35">Optional, but helpful for guests.</div>}
              <label className="mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-black text-white/75 hover:bg-white/[0.08]"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={uploading || saving} onChange={(event) => { const file = event.target.files?.[0] || null; void upload(file); event.currentTarget.value = ""; }} />{uploading ? "Uploading..." : draft.image_url ? "Replace photo" : "Upload photo"}</label>
            </div>
          </div>
        </div> : null}

        {step === 2 ? <div>
          <h3 className="text-xl font-black">How does it work?</h3>
          <p className="mt-1 text-sm font-semibold text-white/45">{needsTimedSetup(draft.item_type) ? "Tell TheOutHaven how guests use or book it." : "Set any booking, age, waiver, or deposit rules that apply."}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {needsTimedSetup(draft.item_type) ? <><label className="grid gap-1"><span className="text-xs font-black text-white/60">Duration in minutes</span><input className={fieldClass} inputMode="numeric" value={draft.duration_minutes} onChange={(event) => update("duration_minutes", event.target.value)} placeholder="90" /></label><label className="grid gap-1"><span className="text-xs font-black text-white/60">Capacity</span><input className={fieldClass} inputMode="numeric" value={draft.capacity} onChange={(event) => update("capacity", event.target.value)} placeholder="6" /></label><label className="grid gap-1 sm:col-span-2"><span className="text-xs font-black text-white/60">Resource type</span><input className={fieldClass} value={draft.resource_type} onChange={(event) => update("resource_type", event.target.value)} placeholder="Example: Bowling Lane, Karaoke Room, Simulator Bay" /></label></> : null}
            <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4"><span><span className="block text-sm font-black">Requires a booking</span><span className="mt-1 block text-xs font-semibold text-white/35">Turn this on when guests should reserve it ahead of time.</span></span><input type="checkbox" checked={draft.requires_booking} onChange={(event) => update("requires_booking", event.target.checked)} /></label>
            <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4"><span><span className="block text-sm font-black">Requires a waiver</span><span className="mt-1 block text-xs font-semibold text-white/35">Useful for activities where a waiver must be signed.</span></span><input type="checkbox" checked={draft.requires_waiver} onChange={(event) => update("requires_waiver", event.target.checked)} /></label>
            <label className="grid gap-1"><span className="text-xs font-black text-white/60">Minimum age</span><input className={fieldClass} inputMode="numeric" value={draft.minimum_age} onChange={(event) => update("minimum_age", event.target.value)} placeholder="21" /></label>
            <label className="grid gap-1"><span className="text-xs font-black text-white/60">Deposit</span><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-white/35">$</span><input className={`${fieldClass} pl-8`} inputMode="decimal" value={draft.deposit} onChange={(event) => update("deposit", event.target.value)} placeholder="25.00" /></div></label>
          </div>
        </div> : null}

        {step === 3 ? <div>
          <h3 className="text-xl font-black">Options</h3>
          <p className="mt-1 text-sm font-semibold text-white/45">Set simple item behavior now. Modifier-group editing will use this same step as we expand it.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 sm:col-span-2"><span className="text-xs font-black text-white/60">Tags</span><input className={fieldClass} value={draft.tags} onChange={(event) => update("tags", event.target.value)} placeholder="Popular, Vegetarian, Date Night" /><span className="text-[11px] font-semibold text-white/30">Separate tags with commas.</span></label>
            <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4"><span><span className="block text-sm font-black">Available</span><span className="mt-1 block text-xs font-semibold text-white/35">Staff and enabled customer channels can use this item.</span></span><input type="checkbox" checked={draft.is_available} onChange={(event) => update("is_available", event.target.checked)} /></label>
            <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4"><span><span className="block text-sm font-black">Featured</span><span className="mt-1 block text-xs font-semibold text-white/35">Highlight this item where supported.</span></span><input type="checkbox" checked={draft.is_featured} onChange={(event) => update("is_featured", event.target.checked)} /></label>
          </div>
        </div> : null}

        {step === 4 ? <div>
          <h3 className="text-xl font-black">Where should it appear?</h3>
          <p className="mt-1 text-sm font-semibold text-white/45">One master item can power every channel. Turn each destination on or off here.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {channelOptions.map(([key, label, help]) => <label key={key} className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${draft.channels[key] ? "border-emerald-400/25 bg-emerald-400/[0.08]" : "border-white/10 bg-white/[0.03]"}`}><span><span className="block text-sm font-black">{label}</span><span className="mt-1 block text-xs font-semibold leading-5 text-white/35">{help}</span></span><input type="checkbox" checked={draft.channels[key]} onChange={(event) => setDraft((current) => ({ ...current, channels: { ...current.channels, [key]: event.target.checked } }))} /></label>)}
          </div>
        </div> : null}

        {step === 5 ? <div>
          <h3 className="text-xl font-black">POS & operations</h3>
          <p className="mt-1 text-sm font-semibold text-white/45">These fields help staff, reporting, taxes, and fulfillment. They are part of the guided setup—not hidden settings.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1"><span className="text-xs font-black text-white/60">POS short name</span><input className={fieldClass} value={draft.pos_short_name} onChange={(event) => update("pos_short_name", event.target.value)} placeholder="Example: Truffle Fries" /></label>
            <label className="grid gap-1"><span className="text-xs font-black text-white/60">SKU</span><input className={fieldClass} value={draft.sku} onChange={(event) => update("sku", event.target.value)} placeholder="Optional internal code" /></label>
            <label className="grid gap-1"><span className="text-xs font-black text-white/60">Tax category</span><input className={fieldClass} value={draft.tax_category} onChange={(event) => update("tax_category", event.target.value)} placeholder="Example: Prepared Food" /></label>
            <label className="grid gap-1"><span className="text-xs font-black text-white/60">Revenue category</span><input className={fieldClass} value={draft.revenue_category} onChange={(event) => update("revenue_category", event.target.value)} placeholder="Example: Food, Lane Rental, Merchandise" /></label>
            <label className="grid gap-1 sm:col-span-2"><span className="text-xs font-black text-white/60">Where should staff fulfill it?</span><input className={fieldClass} value={draft.prep_station} onChange={(event) => update("prep_station", event.target.value)} placeholder="Example: Kitchen, Bar, Front Desk, Bowling Desk, Paint Supply Station" /></label>
          </div>
        </div> : null}

        {step === 6 ? <div>
          <h3 className="text-xl font-black">Review & save</h3>
          <p className="mt-1 text-sm font-semibold text-white/45">Check the item once, then save it to the shared catalog.</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#ff9bb6]">{typeLabel}</p><h4 className="mt-2 text-2xl font-black">{draft.name || "Unnamed item"}</h4><p className="mt-2 text-sm font-semibold leading-6 text-white/45">{draft.description || "No description"}</p></div><p className="text-lg font-black">{draft.price ? `$${Number(draft.price || 0).toFixed(2)}` : "No price"}</p></div>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-white/55"><span className="rounded-full border border-white/10 px-3 py-1.5">{selectedCategory || "No category"}</span>{draft.duration_minutes ? <span className="rounded-full border border-white/10 px-3 py-1.5">{draft.duration_minutes} min</span> : null}{draft.capacity ? <span className="rounded-full border border-white/10 px-3 py-1.5">Capacity {draft.capacity}</span> : null}{draft.requires_booking ? <span className="rounded-full border border-white/10 px-3 py-1.5">Booking required</span> : null}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-white/35">Enabled channels</p>
              <div className="mt-3 grid gap-2">{channelOptions.filter(([key]) => draft.channels[key]).map(([key, label]) => <div key={key} className="flex items-center gap-2 text-sm font-bold text-white/60"><span className="text-emerald-300">✓</span>{label}</div>)}</div>
              {!channelOptions.some(([key]) => draft.channels[key]) ? <p className="mt-3 text-sm font-semibold text-amber-200">This item is not enabled on any channel.</p> : null}
            </div>
          </div>
        </div> : null}
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className={`text-sm font-semibold ${errorMessage ? "text-red-300" : "text-white/45"}`}>{message || `Step ${step + 1} of ${steps.length}: ${steps[step][1]}`}</div>
        <div className="flex gap-2">
          {step > 0 ? <button type="button" onClick={back} className="rounded-xl border border-white/10 px-5 py-3 text-sm font-black text-white/65">Back</button> : null}
          {step < steps.length - 1 ? <button type="button" onClick={next} className="rounded-xl bg-[#ff2142] px-6 py-3 text-sm font-black text-white">Next</button> : <button type="button" onClick={saveItem} disabled={saving || uploading} className="rounded-xl bg-[#ff2142] px-6 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? "Saving..." : editingItemId ? "Save changes" : "Save item"}</button>}
        </div>
      </div>

      {items.length ? <div className="mt-6 border-t border-white/10 pt-5"><div className="mb-3 flex items-end justify-between gap-3"><div><h3 className="text-lg font-black">Your catalog items</h3><p className="mt-1 text-xs font-semibold text-white/35">Choose any item to walk through the same steps and edit it.</p></div><p className="text-xs font-bold text-white/35">{items.length} item{items.length === 1 ? "" : "s"}</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((item: any) => { const active=String(item.id)===editingItemId; return <button type="button" key={String(item.id)} onClick={() => editItem(item)} className={`flex w-full gap-3 rounded-2xl border p-3 text-left transition ${active ? "border-[#ff2142]/60 bg-[#ff2142]/10" : "border-white/10 bg-white/[0.025] hover:border-white/20"}`}>{item.image_url ? <img src={item.image_url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-[10px] font-black text-white/25">NO PHOTO</div>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{item.name || "Untitled item"}</p><p className="mt-1 text-xs font-bold text-white/50">{itemPrice(item)}</p><p className="mt-1 truncate text-xs font-semibold text-white/35">{sectionById.get(String(item.section_id)) || "Uncategorized"}</p></div></button>; })}</div></div> : null}
    </section>
  );
}
