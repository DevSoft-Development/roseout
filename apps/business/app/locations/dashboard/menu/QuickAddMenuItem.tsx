"use client";

import { useMemo, useState } from "react";

const fieldBase = "w-full rounded-xl border bg-black/30 px-3 py-2.5 text-sm font-bold text-white outline-none placeholder:text-white/30 focus:ring-4";
const fieldClass = `${fieldBase} border-white/10 focus:border-[#ff2142]/60 focus:ring-[#ff2142]/10`;
const fieldErrorClass = `${fieldBase} border-red-400/70 focus:border-red-400 focus:ring-red-400/10`;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxImageBytes = 8 * 1024 * 1024;

const itemTypes = [
  { value: "food_beverage", label: "Food or drink", help: "Meals, snacks, cocktails, coffee, desserts, and similar items." },
  { value: "retail", label: "Retail product", help: "Merchandise, packaged goods, gifts, or take-home products." },
  { value: "service", label: "Service", help: "A service sold without reserving a timed resource." },
  { value: "timed_resource", label: "Timed activity", help: "Bowling lanes, karaoke rooms, golf bays, pool tables, and similar resources." },
  { value: "admission_experience", label: "Experience or admission", help: "Sip-and-paint, classes, attractions, tickets, and admission." },
  { value: "rental", label: "Rental", help: "Shoes, equipment, lockers, or other rentable items." },
  { value: "package_bundle", label: "Package", help: "Birthday packages, bundles, combos, and grouped offerings." },
  { value: "fee_deposit", label: "Fee or deposit", help: "Deposits, service fees, damage deposits, or other charges." },
] as const;

const steps = [
  "What are you adding?",
  "Basic details",
  "How it works",
  "Where it appears",
  "POS & operations",
  "Review",
];

type Props = {
  locationId: string;
  sections: any[];
  items: any[];
  contextKey: "locationId" | "adminLocationId" | "demoLocationId";
  contextPayload: Record<string, unknown>;
};

type Channels = {
  website: boolean;
  profile: boolean;
  pos: boolean;
  reserve: boolean;
  online_ordering: boolean;
  qr_ordering: boolean;
  kiosk: boolean;
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

function moneyFromCents(value: any) {
  if (value == null || value === "") return "";
  return (Number(value) / 100).toFixed(2);
}

function priceError(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^\$?\d+(\.\d{0,2})?$/.test(trimmed.replace(/,/g, ""))) return "Use a valid price such as 14 or 14.99.";
  const numeric = Number(trimmed.replace(/[$,]/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return "Price cannot be negative.";
  return "";
}

function positiveWholeNumberError(value: string, label: string) {
  if (!value.trim()) return "";
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? "" : `${label} must be a whole number greater than 0.`;
}

function defaultChannels(): Channels {
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

function channelsFromItem(item: any): Channels {
  const source = item?.channel_visibility && typeof item.channel_visibility === "object"
    ? item.channel_visibility
    : {};
  return {
    website: source.website !== false,
    profile: source.profile !== false,
    pos: source.pos !== false,
    reserve: source.reserve === true,
    online_ordering: source.online_ordering === true,
    qr_ordering: source.qr_ordering === true,
    kiosk: source.kiosk === true,
  };
}

export default function QuickAddMenuItem({ locationId, sections, items, contextKey, contextPayload }: Props) {
  const [step, setStep] = useState(0);
  const [editingItemId, setEditingItemId] = useState("");
  const [itemType, setItemType] = useState("food_beverage");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [sectionId, setSectionId] = useState(sections[0]?.id ? String(sections[0].id) : "__new__");
  const [newSection, setNewSection] = useState(sections.length ? "" : "General");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [capacity, setCapacity] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [requiresBooking, setRequiresBooking] = useState(false);
  const [requiresWaiver, setRequiresWaiver] = useState(false);
  const [minimumAge, setMinimumAge] = useState("");
  const [deposit, setDeposit] = useState("");
  const [channels, setChannels] = useState<Channels>(defaultChannels());
  const [posShortName, setPosShortName] = useState("");
  const [sku, setSku] = useState("");
  const [taxCategory, setTaxCategory] = useState("");
  const [revenueCategory, setRevenueCategory] = useState("");
  const [prepStation, setPrepStation] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const editingItem = items.find((item: any) => String(item.id) === editingItemId);
  const sectionById = useMemo(() => new Map(sections.map((section) => [String(section.id), sectionName(section)])), [sections]);
  const nameError = !name.trim() ? "Item name is required." : "";
  const currentPriceError = priceError(price);
  const categoryError = sectionId === "__new__" && !newSection.trim() ? "Enter a category name." : "";
  const durationError = positiveWholeNumberError(durationMinutes, "Duration");
  const capacityError = positiveWholeNumberError(capacity, "Capacity");
  const hasErrors = Boolean(nameError || currentPriceError || categoryError || durationError || capacityError);

  const selectedType = itemTypes.find((entry) => entry.value === itemType) || itemTypes[0];
  const needsTime = ["timed_resource", "admission_experience", "rental"].includes(itemType);
  const needsResource = itemType === "timed_resource";
  const canBook = ["timed_resource", "admission_experience", "service", "rental", "package_bundle"].includes(itemType);
  const canPrep = itemType === "food_beverage";

  function touch(field: string) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function resetForm() {
    setStep(0);
    setEditingItemId("");
    setItemType("food_beverage");
    setName("");
    setPrice("");
    setDescription("");
    setImageUrl("");
    setSectionId(sections[0]?.id ? String(sections[0].id) : "__new__");
    setNewSection(sections.length ? "" : "General");
    setDurationMinutes("");
    setCapacity("");
    setResourceType("");
    setRequiresBooking(false);
    setRequiresWaiver(false);
    setMinimumAge("");
    setDeposit("");
    setChannels(defaultChannels());
    setPosShortName("");
    setSku("");
    setTaxCategory("");
    setRevenueCategory("");
    setPrepStation("");
    setAttemptedSave(false);
    setTouched({});
    setMessage("");
  }

  function editItem(item: any) {
    setEditingItemId(String(item.id));
    setItemType(String(item.item_type || "food_beverage"));
    setName(String(item.name || ""));
    setPrice(editablePrice(item));
    setDescription(String(item.description || ""));
    setImageUrl(String(item.image_url || ""));
    setSectionId(item.section_id ? String(item.section_id) : (sections[0]?.id ? String(sections[0].id) : "__new__"));
    setNewSection("");
    setDurationMinutes(item.duration_minutes == null ? "" : String(item.duration_minutes));
    setCapacity(item.capacity == null ? "" : String(item.capacity));
    setResourceType(String(item.resource_type || ""));
    setRequiresBooking(item.requires_booking === true);
    setRequiresWaiver(item.requires_waiver === true);
    setMinimumAge(item.minimum_age == null ? "" : String(item.minimum_age));
    setDeposit(moneyFromCents(item.deposit_cents));
    setChannels(channelsFromItem(item));
    setPosShortName(String(item.pos_short_name || ""));
    setSku(String(item.sku || ""));
    setTaxCategory(String(item.tax_category || ""));
    setRevenueCategory(String(item.revenue_category || ""));
    setPrepStation(String(item.prep_station || ""));
    setAttemptedSave(false);
    setTouched({});
    setMessage(`Editing ${item.name || "item"}. Follow the steps and save when everything looks right.`);
    setStep(0);
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
      setImageUrl(String(json.url));
      setMessage("Photo uploaded.");
    } catch (error: any) {
      setMessage(error?.message || "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function validateBeforeNext() {
    if (step === 1) {
      setTouched((current) => ({ ...current, name: true, price: true, category: true }));
      if (nameError || currentPriceError || categoryError) {
        setMessage("Fix the highlighted fields before continuing.");
        return false;
      }
    }
    if (step === 2 && (durationError || capacityError)) {
      setMessage(durationError || capacityError);
      return false;
    }
    setMessage("");
    return true;
  }

  function nextStep() {
    if (!validateBeforeNext()) return;
    setStep((current) => Math.min(steps.length - 1, current + 1));
  }

  async function saveItem() {
    if (saving || uploading) return;
    setAttemptedSave(true);
    setTouched({ name: true, price: true, category: true });
    setMessage("");

    if (hasErrors) {
      setMessage("Fix the highlighted fields before saving this item.");
      setStep(nameError || currentPriceError || categoryError ? 1 : 2);
      return;
    }

    const numericPrice = price.trim() ? Number(String(price).replace(/[$,]/g, "").trim()) : 0;
    const numericDeposit = deposit.trim() ? Number(String(deposit).replace(/[$,]/g, "").trim()) : 0;
    setSaving(true);

    try {
      let targetSectionId = sectionId;
      if (sectionId === "__new__" || !sectionId) {
        const title = newSection.trim();
        const sectionResult = await api("POST", { action: "create_section", title });
        const created = (sectionResult?.data?.sections || sectionResult?.sections || []).find((entry: any) => sectionName(entry).toLowerCase() === title.toLowerCase());
        if (!created?.id) throw new Error("The category was created, but could not be selected. Refresh and try again.");
        targetSectionId = String(created.id);
      }

      const common = {
        section_id: targetSectionId,
        name: name.trim(),
        description: description.trim(),
        price_cents: price.trim() ? Math.round(numericPrice * 100) : null,
        price_label: price.trim() ? `$${numericPrice.toFixed(2)}` : "",
        image_url: imageUrl,
        tags: editingItem?.tags || [],
        is_available: editingItem ? editingItem.is_available !== false : true,
        is_featured: editingItem?.is_featured === true,
        item_type: itemType,
        duration_minutes: durationMinutes.trim() ? Number(durationMinutes) : null,
        capacity: capacity.trim() ? Number(capacity) : null,
        resource_type: resourceType.trim() || null,
        requires_booking: requiresBooking,
        requires_waiver: requiresWaiver,
        minimum_age: minimumAge.trim() ? Number(minimumAge) : null,
        deposit_cents: deposit.trim() ? Math.round(numericDeposit * 100) : null,
        channel_visibility: channels,
        pos_short_name: posShortName.trim() || null,
        sku: sku.trim() || null,
        tax_category: taxCategory.trim() || null,
        revenue_category: revenueCategory.trim() || null,
        prep_station: prepStation.trim() || null,
      };

      if (editingItemId) {
        await api("PATCH", { action: "update_item", item_id: editingItemId, ...common });
      } else {
        await api("POST", { action: "create_item", ...common });
      }
      window.location.reload();
    } catch (error: any) {
      setMessage(error?.message || "We could not save this item.");
      setSaving(false);
    }
  }

  const errorMessage = message.toLowerCase().includes("fix") || message.toLowerCase().includes("failed") || message.toLowerCase().includes("could not") || message.toLowerCase().includes("not supported") || message.toLowerCase().includes("too large");

  return (
    <section id="menu-item-editor" className="scroll-mt-28 rounded-[2rem] border border-white/10 bg-[#0c1017] p-5 shadow-[0_24px_80px_rgba(0,0,0,.24)] sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#f5b700]">{editingItemId ? "Editing item" : "Guided item setup"}</p>
          <h2 className="mt-1 text-2xl font-black">{editingItemId ? `Edit ${editingItem?.name || "item"}` : "Add what you sell"}</h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/55">Follow the steps from left to right. Every setting is part of the flow, so you never need to hunt through an advanced menu.</p>
        </div>
        <div className="flex items-center gap-2">
          {editingItemId ? <button type="button" onClick={resetForm} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-white/60 hover:bg-white/[0.05]">Cancel edit</button> : null}
          <p className="text-xs font-bold text-white/35">{items.length} saved item{items.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(index)}
            className={`rounded-2xl border px-3 py-3 text-left transition ${step === index ? "border-[#ff2142]/60 bg-[#ff2142]/10" : index < step ? "border-emerald-400/20 bg-emerald-400/[0.05]" : "border-white/10 bg-white/[0.025]"}`}
          >
            <span className={`text-[10px] font-black uppercase tracking-[0.14em] ${step === index ? "text-[#ff6b86]" : "text-white/35"}`}>Step {index + 1}</span>
            <p className="mt-1 text-xs font-black text-white">{label}</p>
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-5 sm:p-6">
        {step === 0 ? (
          <div>
            <h3 className="text-xl font-black">What are you adding?</h3>
            <p className="mt-1 text-sm font-semibold text-white/45">Pick the closest match. The next steps will adapt to it.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {itemTypes.map((entry) => (
                <button key={entry.value} type="button" onClick={() => setItemType(entry.value)} className={`rounded-2xl border p-4 text-left transition ${itemType === entry.value ? "border-[#ff2142]/60 bg-[#ff2142]/10" : "border-white/10 bg-white/[0.025] hover:border-white/20"}`}>
                  <p className="font-black text-white">{entry.label}</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-white/40">{entry.help}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div>
            <h3 className="text-xl font-black">Basic details</h3>
            <p className="mt-1 text-sm font-semibold text-white/45">Give guests the information they need to recognize and buy this item.</p>
            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1 sm:col-span-2" htmlFor="menu-item-name"><span className="text-xs font-black text-white/60">Item name <span className="text-[#ff6b86]">* Required</span></span><input id="menu-item-name" aria-invalid={Boolean(nameError && (attemptedSave || touched.name))} className={nameError && (attemptedSave || touched.name) ? fieldErrorClass : fieldClass} value={name} onBlur={() => touch("name")} onChange={(event) => setName(event.target.value)} placeholder={itemType === "timed_resource" ? "Example: 90-Minute Lane Rental" : itemType === "admission_experience" ? "Example: Friday Sip & Paint" : "Example: Truffle Fries"} /></label>
                <label className="grid gap-1" htmlFor="menu-item-price"><span className="text-xs font-black text-white/60">Price <span className="font-semibold text-white/30">Optional</span></span><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-white/35">$</span><input id="menu-item-price" className={`${currentPriceError && (attemptedSave || touched.price) ? fieldErrorClass : fieldClass} pl-7`} inputMode="decimal" value={price} onBlur={() => touch("price")} onChange={(event) => setPrice(event.target.value)} placeholder="14.00" /></div></label>
                <label className="grid gap-1" htmlFor="menu-item-category"><span className="text-xs font-black text-white/60">Category <span className="text-[#ff6b86]">* Required</span></span><select id="menu-item-category" className={fieldClass} value={sectionId} onChange={(event) => setSectionId(event.target.value)}>{sections.map((section) => <option key={String(section.id)} value={String(section.id)}>{sectionName(section)}</option>)}<option value="__new__">+ Create a new category</option></select></label>
                {sectionId === "__new__" ? <label className="grid gap-1 sm:col-span-2"><span className="text-xs font-black text-white/60">New category name</span><input className={categoryError && (attemptedSave || touched.category) ? fieldErrorClass : fieldClass} value={newSection} onBlur={() => touch("category")} onChange={(event) => setNewSection(event.target.value)} placeholder="Example: Cocktails, Packages, Activities" /></label> : null}
                <label className="grid gap-1 sm:col-span-2"><span className="text-xs font-black text-white/60">Description</span><textarea className={fieldClass} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short description guests will understand." /></label>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Photo</p>
                {imageUrl ? <img src={imageUrl} alt="Item preview" className="mt-3 h-40 w-full rounded-xl object-cover" /> : <div className="mt-3 grid h-40 place-items-center rounded-xl border border-dashed border-white/15 px-6 text-center text-xs font-bold text-white/35">Add a photo so guests know what they are choosing.</div>}
                <label className="mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-black text-white/75"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={uploading || saving} onChange={(event) => { void upload(event.target.files?.[0] || null); event.currentTarget.value = ""; }} />{uploading ? "Uploading..." : imageUrl ? "Replace photo" : "Upload photo"}</label>
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <h3 className="text-xl font-black">How does this work?</h3>
            <p className="mt-1 text-sm font-semibold text-white/45">You chose <span className="text-white/75">{selectedType.label}</span>. Only the operational details that make sense for this type are emphasized.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {needsTime ? <label className="grid gap-1"><span className="text-xs font-black text-white/60">Duration in minutes</span><input className={durationError ? fieldErrorClass : fieldClass} inputMode="numeric" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} placeholder="90" />{durationError ? <span className="text-xs font-bold text-red-300">{durationError}</span> : null}</label> : null}
              {(needsTime || itemType === "package_bundle") ? <label className="grid gap-1"><span className="text-xs font-black text-white/60">Capacity</span><input className={capacityError ? fieldErrorClass : fieldClass} inputMode="numeric" value={capacity} onChange={(event) => setCapacity(event.target.value)} placeholder="6" />{capacityError ? <span className="text-xs font-bold text-red-300">{capacityError}</span> : null}</label> : null}
              {needsResource ? <label className="grid gap-1"><span className="text-xs font-black text-white/60">Resource type</span><input className={fieldClass} value={resourceType} onChange={(event) => setResourceType(event.target.value)} placeholder="Bowling lane, karaoke room, golf bay..." /></label> : null}
              {canBook ? <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4"><input type="checkbox" checked={requiresBooking} onChange={(event) => setRequiresBooking(event.target.checked)} className="h-5 w-5" /><span><span className="block text-sm font-black">Requires booking</span><span className="text-xs font-semibold text-white/35">Guests should reserve this before using it.</span></span></label> : null}
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4"><input type="checkbox" checked={requiresWaiver} onChange={(event) => setRequiresWaiver(event.target.checked)} className="h-5 w-5" /><span><span className="block text-sm font-black">Requires waiver</span><span className="text-xs font-semibold text-white/35">Useful for activities that need a signed waiver.</span></span></label>
              <label className="grid gap-1"><span className="text-xs font-black text-white/60">Minimum age</span><input className={fieldClass} inputMode="numeric" value={minimumAge} onChange={(event) => setMinimumAge(event.target.value)} placeholder="Leave blank if none" /></label>
              <label className="grid gap-1"><span className="text-xs font-black text-white/60">Deposit</span><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-white/35">$</span><input className={`${fieldClass} pl-7`} inputMode="decimal" value={deposit} onChange={(event) => setDeposit(event.target.value)} placeholder="0.00" /></div></label>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <h3 className="text-xl font-black">Where should this item appear?</h3>
            <p className="mt-1 text-sm font-semibold text-white/45">Turn channels on or off. Nothing is hidden—you can see every destination here.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {([
                ["website", "Location website", "Show this item on the business website."],
                ["profile", "TheOutHaven profile", "Show this item on the public location profile."],
                ["pos", "ThePOSHaven", "Make this item available to staff on the POS."],
                ["reserve", "Reserve", "Make this item available in reservation flows."],
                ["online_ordering", "Online ordering", "Allow future web ordering for this item."],
                ["qr_ordering", "QR ordering", "Allow future table/venue QR ordering."],
                ["kiosk", "Kiosk", "Allow future self-service kiosk ordering."],
              ] as const).map(([key, label, help]) => (
                <label key={key} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                  <input type="checkbox" checked={channels[key]} onChange={(event) => setChannels((current) => ({ ...current, [key]: event.target.checked }))} className="mt-0.5 h-5 w-5" />
                  <span><span className="block text-sm font-black">{label}</span><span className="mt-1 block text-xs font-semibold leading-5 text-white/35">{help}</span></span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <h3 className="text-xl font-black">POS & operations</h3>
            <p className="mt-1 text-sm font-semibold text-white/45">These fields help staff, reporting, taxes, and fulfillment. They are part of the normal flow—not an advanced drawer.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <label className="grid gap-1"><span className="text-xs font-black text-white/60">POS short name</span><input className={fieldClass} value={posShortName} onChange={(event) => setPosShortName(event.target.value)} placeholder={name ? name.slice(0, 18) : "Short staff-facing name"} /></label>
              <label className="grid gap-1"><span className="text-xs font-black text-white/60">SKU</span><input className={fieldClass} value={sku} onChange={(event) => setSku(event.target.value)} placeholder="Optional internal code" /></label>
              <label className="grid gap-1"><span className="text-xs font-black text-white/60">Tax category</span><input className={fieldClass} value={taxCategory} onChange={(event) => setTaxCategory(event.target.value)} placeholder={itemType === "food_beverage" ? "Prepared food" : "Entertainment"} /></label>
              <label className="grid gap-1"><span className="text-xs font-black text-white/60">Revenue category</span><input className={fieldClass} value={revenueCategory} onChange={(event) => setRevenueCategory(event.target.value)} placeholder="Food, Bar, Lane Rental, Admission..." /></label>
              {canPrep ? <label className="grid gap-1"><span className="text-xs font-black text-white/60">Prep station</span><input className={fieldClass} value={prepStation} onChange={(event) => setPrepStation(event.target.value)} placeholder="Kitchen, Bar, Dessert..." /></label> : null}
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div>
            <h3 className="text-xl font-black">Review & save</h3>
            <p className="mt-1 text-sm font-semibold text-white/45">Check the important details before saving. You can jump back to any step above.</p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-white/35">Guest view</p>
                <p className="mt-3 text-xl font-black">{name || "Untitled item"}</p>
                <p className="mt-1 text-sm font-black text-[#f5b700]">{price.trim() ? `$${Number(price.replace(/[$,]/g, "") || 0).toFixed(2)}` : "No price set"}</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-white/45">{description || "No description yet."}</p>
                <p className="mt-3 text-xs font-bold text-white/35">{selectedType.label} · {sectionId === "__new__" ? newSection || "New category" : sectionById.get(sectionId) || "Uncategorized"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-white/35">Operations</p>
                <div className="mt-3 space-y-2 text-sm font-semibold text-white/55">
                  <p>POS: <span className="text-white">{channels.pos ? "On" : "Off"}</span></p>
                  <p>Website: <span className="text-white">{channels.website ? "On" : "Off"}</span></p>
                  <p>Profile: <span className="text-white">{channels.profile ? "On" : "Off"}</span></p>
                  {durationMinutes ? <p>Duration: <span className="text-white">{durationMinutes} minutes</span></p> : null}
                  {capacity ? <p>Capacity: <span className="text-white">{capacity}</span></p> : null}
                  {resourceType ? <p>Resource: <span className="text-white">{resourceType}</span></p> : null}
                  <p>Booking: <span className="text-white">{requiresBooking ? "Required" : "Not required"}</span></p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className={`text-sm font-semibold ${errorMessage ? "text-red-300" : "text-white/50"}`}>{message || `Step ${step + 1} of ${steps.length}: ${steps[step]}`}</div>
        <div className="flex gap-2">
          {step > 0 ? <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} className="rounded-xl border border-white/10 px-5 py-3 text-sm font-black text-white/70">Back</button> : null}
          {step < steps.length - 1 ? <button type="button" onClick={nextStep} className="rounded-xl bg-[#ff2142] px-6 py-3 text-sm font-black text-white">Next</button> : <button type="button" onClick={saveItem} disabled={saving || uploading} className="rounded-xl bg-[#f5b700] px-6 py-3 text-sm font-black text-black disabled:opacity-50">{saving ? "Saving..." : editingItemId ? "Save changes" : "Save item"}</button>}
        </div>
      </div>

      {items.length ? (
        <div className="mt-7 border-t border-white/10 pt-5">
          <div className="mb-3 flex items-end justify-between gap-3"><div><h3 className="text-lg font-black">Saved items</h3><p className="mt-1 text-xs font-semibold text-white/35">Choose an item to walk through the same steps and edit it.</p></div><p className="text-xs font-bold text-white/35">{items.length} total</p></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item: any) => (
              <button type="button" key={String(item.id)} onClick={() => editItem(item)} className={`flex w-full gap-3 rounded-2xl border p-3 text-left transition ${String(item.id) === editingItemId ? "border-[#ff2142]/60 bg-[#ff2142]/10" : "border-white/10 bg-white/[0.025] hover:border-white/20"}`}>
                {item.image_url ? <img src={item.image_url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-[10px] font-black text-white/25">NO PHOTO</div>}
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{item.name || "Untitled item"}</p><p className="mt-1 text-xs font-bold text-white/50">{itemPrice(item)}</p><p className="mt-1 truncate text-xs font-semibold text-white/35">{sectionById.get(String(item.section_id)) || "Uncategorized"} · {itemTypes.find((entry) => entry.value === String(item.item_type || "food_beverage"))?.label || "Item"}</p></div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
